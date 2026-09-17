import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('NoteFeedbackSyncService (P3.1 自动数据同步与评论痛点反哺)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT OR REPLACE INTO accounts (id, nickname, is_active) VALUES (1, '极客博主', 1)").run();

        // 插入已发布的笔记数据到 note_stats
        db.prepare(`
            INSERT INTO note_stats (
                id, note_id, title, views, likes, collects, comments, account_id, publish_date
            ) VALUES (
                10, 'note_xyz_1', '双轴云台防烧板接线实战', 12500, 860, 940, 68, 1, '2026-09-14 10:00:00'
            )
        `).run();

        // 插入该笔记相关的评论到 comments 表
        db.prepare(`
            INSERT INTO comments (
                id, note_id, content, user_nickname, intent, reply_status, account_id
            ) VALUES (
                'c_101', 'note_xyz_1', '请问示波器探头地线夹子应该夹在电源负极还是驱动地？', '电赛小白', 'INQUIRY', 'PENDING', 1
            )
        `).run();

        db.prepare(`
            INSERT INTO comments (
                id, note_id, content, user_nickname, intent, reply_status, account_id
            ) VALUES (
                'c_102', 'note_xyz_1', '按照教程调了死区时间，电机完全不发烫了！太牛了', '硬件发烧友', 'PRAISE', 'REPLIED', 1
            )
        `).run();
    });

    it('能够拉取账号已发布的笔记列表及最新指标，作为复盘预填依据', async () => {
        const { NoteFeedbackSyncService } = await import('../../api/services/core/NoteFeedbackSyncService.js');

        const notes = NoteFeedbackSyncService.getSyncableNotes(1);
        expect(notes).toHaveLength(1);
        expect(notes[0].noteId).toBe('note_xyz_1');
        expect(notes[0].title).toBe('双轴云台防烧板接线实战');
        expect(notes[0].views).toBe(12500);
        expect(notes[0].collects).toBe(940);
        expect(notes[0].hasReview).toBe(false);
    });

    it('能够自动提取笔记评论区高频痛点与疑问（Inquiry/Complaint），并提炼为复盘反馈信号', async () => {
        const { NoteFeedbackSyncService } = await import('../../api/services/core/NoteFeedbackSyncService.js');

        const feedback = NoteFeedbackSyncService.extractNoteFeedbackSignals('note_xyz_1');
        expect(feedback.inquiryComments).toHaveLength(1);
        expect(feedback.inquiryComments[0].content).toContain('示波器探头地线夹子');
        expect(feedback.signals).toContain('请问示波器探头地线夹子应该夹在电源负极还是驱动地？');
    });

    it('支持一键将特定高价值求助评论转化为 P1.2 研究证据（Research Evidence）', async () => {
        const { NoteFeedbackSyncService } = await import('../../api/services/core/NoteFeedbackSyncService.js');
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        const evidence = NoteFeedbackSyncService.convertCommentToEvidence('c_101', 1);
        expect(evidence.id).toBeDefined();
        expect(evidence.rawText).toContain('示波器探头地线夹子');
        expect(evidence.authorNickname).toBe('电赛小白');

        // 验证已持久化在 P1.2 证据库
        const list = ResearchOpportunityService.listEvidence(1);
        expect(list.some(e => e.id === evidence.id)).toBe(true);
    });

    it('支持从已同步笔记一键自动生成预填复盘卡片（包含自动拉取的指标与提炼的反馈信号）', async () => {
        const { NoteFeedbackSyncService } = await import('../../api/services/core/NoteFeedbackSyncService.js');
        const { NoteReviewService } = await import('../../api/services/core/NoteReviewService.js');

        const review = NoteFeedbackSyncService.autoCreateReviewFromNote(1, 'note_xyz_1');
        expect(review.id).toBeDefined();
        expect(review.title).toBe('双轴云台防烧板接线实战');
        expect(review.views).toBe(12500);
        expect(review.collects).toBe(940);
        expect(review.feedbackSignals).toContain('请问示波器探头地线夹子应该夹在电源负极还是驱动地？');

        // 验证持久化落库在 note_reviews 表
        const fetched = NoteReviewService.getReview(review.id);
        expect(fetched?.views).toBe(12500);
    });
});
