import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('ResearchOpportunityService (P1.2 证据录入与内容机会卡)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '极客技术博主', 1)").run();
    });

    it('能够录入研究证据（用户原话、评论、痛点标签与来源链接）并持久化检索', async () => {
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        const evidence = ResearchOpportunityService.addEvidence({
            accountId: 1,
            sourceType: 'COMMENT',
            sourceUrl: 'https://www.xiaohongshu.com/explore/testnote123',
            rawText: '买回来才发现电机抖得厉害，PID怎么调都稳不住，官方例程简直误导人！',
            painPoints: ['云台电机高频抖动', '官方例程有缺陷', 'PID参数无从下手'],
            desires: ['想要一份真实可用的防抖调参清单'],
            authorNickname: '匿名创作者A'
        });

        expect(evidence.id).toBeDefined();
        expect(evidence.rawText).toContain('电机抖得厉害');

        const list = ResearchOpportunityService.listEvidence(1);
        expect(list).toHaveLength(1);
        expect(list[0].painPoints).toContain('云台电机高频抖动');
    });

    it('能够将一条或多条证据关联并创建结构化的“内容机会卡”（Content Opportunity）', async () => {
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        const ev1 = ResearchOpportunityService.addEvidence({
            accountId: 1,
            sourceType: 'COMMENT',
            rawText: '很多教程只讲理论公式，一上实机就发热失步。',
            painPoints: ['电机发热', '丢步失步']
        });

        const ev2 = ResearchOpportunityService.addEvidence({
            accountId: 1,
            sourceType: 'DM',
            rawText: '博主你用的那个双JC2804驱动板是在哪打样的？开源吗？',
            painPoints: ['缺乏工程级硬件开源参考']
        });

        const opp = ResearchOpportunityService.createOpportunity({
            accountId: 1,
            title: '无刷云台电机发热与高频抖动：手把手避坑实战',
            targetAudience: '正在做电赛云台或机器人视觉的学生/极客',
            scenario: '机械结构刚组装完，一通电调PID电机就烫手且微抖',
            problem: '解决官方例程参数与实际硬件不匹配、死区和滤波设置错误',
            uniqueAngle: '展示自研双JC2804实机波形对比，给出经过实战验证的参数表',
            contentFormat: 'CHECKLIST',
            expectedOutcome: 'TRUST',
            contentPillar: '硬件避坑',
            evidenceIds: [ev1.id, ev2.id]
        });

        expect(opp.id).toBeDefined();
        expect(opp.status).toBe('IDEA');
        expect(opp.title).toContain('手把手避坑实战');
        expect(opp.evidence).toHaveLength(2);
        expect(opp.evidence[0].rawText).toContain('发热失步');
        expect(opp.evidence[0].painPoints).toContain('电机发热');
    });

    it('创作者能够对机会卡执行明确决策（采纳 ACCEPTED / 暂缓 DEFERRED / 舍弃 REJECTED）并记录决策依据', async () => {
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        const opp = ResearchOpportunityService.createOpportunity({
            accountId: 1,
            title: '测试选题机会',
            targetAudience: '开发者',
            scenario: '场景A',
            problem: '痛点B',
            uniqueAngle: '角度C',
            contentFormat: 'TUTORIAL',
            expectedOutcome: 'FAVORITE',
            evidenceIds: []
        });

        expect(opp.status).toBe('IDEA');

        // 决策采纳
        const accepted = ResearchOpportunityService.decideOpportunity(opp.id, 'ACCEPTED', '符合本周内容栏目排期');
        expect(accepted.status).toBe('ACCEPTED');
        expect(accepted.decisionReason).toBe('符合本周内容栏目排期');

        // 决策舍弃
        const rejected = ResearchOpportunityService.decideOpportunity(opp.id, 'REJECTED', '偏离当前硬件主题');
        expect(rejected.status).toBe('REJECTED');
        expect(rejected.decisionReason).toBe('偏离当前硬件主题');
    });

    it('能够导出机会卡的完整创作提示词上下文（含用户原话证据，为下步创作提供不可伪造的真实细节）', async () => {
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        const ev = ResearchOpportunityService.addEvidence({
            accountId: 1,
            sourceType: 'COMMENT',
            rawText: '调了三天三夜，每次一打激光就偏移2个像素！',
            painPoints: ['激光点微量偏移']
        });

        const opp = ResearchOpportunityService.createOpportunity({
            accountId: 1,
            title: '405nm蓝色激光亚像素光斑追踪踩坑记',
            targetAudience: '视觉算法调试者',
            scenario: '动态跟踪A4靶标时激光有微小抖动',
            problem: '解决曝光过曝导致的质心漂移',
            uniqueAngle: '结合OpenCV亚像素角点与动态自适应阈值实战源码',
            contentFormat: 'CASE_STUDY',
            expectedOutcome: 'TRUST',
            evidenceIds: [ev.id]
        });

        const context = ResearchOpportunityService.exportOpportunityBrief(opp.id);
        expect(context).toContain('【内容机会卡 (Content Opportunity)】');
        expect(context).toContain('选题标题: 405nm蓝色激光亚像素光斑追踪踩坑记');
        expect(context).toContain('解决真实痛点: 解决曝光过曝导致的质心漂移');
        expect(context).toContain('独特立足角度: 结合OpenCV亚像素角点与动态自适应阈值实战源码');
        expect(context).toContain('用户真实原话证据');
        expect(context).toContain('调了三天三夜，每次一打激光就偏移2个像素！');
    });
});
