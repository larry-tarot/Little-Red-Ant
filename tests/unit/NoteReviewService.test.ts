import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('NoteReviewService (P2.4 手动复盘与反馈信号闭环)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '极客博主', 1)").run();
    });

    it('能够录入笔记复盘（包含真实指标、封面点击判断、正文干货度、亮点、不足与用户反馈信号）', async () => {
        const { NoteReviewService } = await import('../../api/services/core/NoteReviewService.js');

        const review = NoteReviewService.createReview({
            accountId: 1,
            title: '无刷电机接线避坑指南',
            publishedAt: '2026-09-10',
            views: 5200,
            likes: 310,
            collects: 420,
            comments: 48,
            ctrAssessment: 'HIGH',
            interactionAssessment: 'HIGH',
            whatWorked: '第2页示波器死区对比图被反复称赞，收藏率达到8%',
            whatFailed: '算法PID部分讲得太简略，评论区很多人追问积分饱和怎么解',
            feedbackSignals: [
                '评论区大量咨询：积分分离和抗饱和具体代码怎么写？',
                '有学生反映买到了假驱动芯片导致直通烧管'
            ],
            nextActionIdeas: [
                '下一篇做《PID抗积分饱和与防超调C代码实操》',
                '写一期《劣质驱动芯片真假辨识实测》'
            ]
        });

        expect(review.id).toBeDefined();
        expect(review.title).toBe('无刷电机接线避坑指南');
        expect(review.feedbackSignals).toHaveLength(2);
        expect(review.nextActionIdeas).toHaveLength(2);

        const list = NoteReviewService.listReviews(1);
        expect(list).toHaveLength(1);
        expect(list[0].collects).toBe(420);
    });

    it('能够从复盘记录的反馈信号中一键反哺生成 P1.2 内容机会卡（完成生命周期闭环）', async () => {
        const { NoteReviewService } = await import('../../api/services/core/NoteReviewService.js');
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        const review = NoteReviewService.createReview({
            accountId: 1,
            title: '第一期复盘',
            views: 2000,
            likes: 120,
            collects: 180,
            comments: 25,
            feedbackSignals: ['很多人留言问：405nm滤光片怎么固定在MaixCAM摄像头上？'],
            nextActionIdeas: ['做一期3D打印卡扣固定滤光片教程']
        });

        // 从复盘信号反哺生成机会卡
        const opp = NoteReviewService.deriveOpportunityFromReview(review.id, {
            ideaIndex: 0,
            targetAudience: '电赛视觉开发学生',
            scenario: '机械结构安装阶段'
        });

        expect(opp.id).toBeDefined();
        expect(opp.title).toContain('3D打印卡扣固定滤光片教程');
        expect(opp.problem).toContain('405nm滤光片怎么固定');
        expect(opp.status).toBe('IDEA');

        // 验证该机会卡真实进入 P1.2 机会池
        const allOpps = ResearchOpportunityService.listOpportunities(1);
        expect(allOpps.some(o => o.id === opp.id)).toBe(true);
    });
});
