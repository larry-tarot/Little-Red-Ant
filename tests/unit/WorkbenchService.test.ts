import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('WorkbenchService (P2.2 今日工作台与主行动流)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '硬件博主', 1)").run();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (2, '其他博主', 1)").run();
    });

    it('能够聚合账号专属的 Today Actions（待决策机会卡、制作中内容包、待确认发布包、雷达监听数）', async () => {
        const { WorkbenchService } = await import('../../api/services/core/WorkbenchService.js');
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');
        const { DemandRadarService } = await import('../../api/services/core/DemandRadarService.js');
        const { DraftService } = await import('../../api/services/core/DraftService.js');

        // 1. 为账号 1 创建一个待决策机会卡
        ResearchOpportunityService.createOpportunity({
            accountId: 1,
            title: '无刷电机发烫失步全解',
            targetAudience: '电赛新手',
            scenario: '通电发烫',
            problem: '死区时间短',
            uniqueAngle: '示波器波形对比',
            contentFormat: 'TUTORIAL',
            expectedOutcome: 'TRUST'
        });

        // 2. 为账号 1 创建一个内容包
        ContentPackageService.createPackage({
            accountId: 1,
            title: '无刷电机防烧实战',
            bodyMarkdown: '正文...'
        });

        // 3. 为账号 1 布设一个需求雷达
        DemandRadarService.addKeywordWatch({
            accountId: 1,
            keyword: '405nm滤光片'
        });

        // 4. 创建一个未发布的待人工核验草稿
        DraftService.createDraft({
            title: '待发布笔记',
            content: '内容...',
            tags: ['硬件']
        });

        // 查询账号 1 的今日工作台
        const wb = WorkbenchService.getTodayWorkbench(1);
        expect(wb.account_name).toBe('硬件博主');
        expect(wb.today_actions).toBeDefined();
        expect(wb.today_actions.pending_opportunities).toHaveLength(1);
        expect(wb.today_actions.pending_opportunities[0].title).toBe('无刷电机发烫失步全解');
        expect(wb.today_actions.in_progress_packages).toHaveLength(1);
        expect(wb.today_actions.active_radar_watches_count).toBe(1);
        expect(wb.today_actions.ready_to_publish_count).toBeGreaterThanOrEqual(1);

        // 验证紧急任务中包含“新选题待决策”的引导
        const oppTask = wb.urgent_tasks.find(t => t.type === 'opportunity_pending' || t.action_link.includes('/opportunities'));
        expect(oppTask).toBeDefined();
    });

    it('不同账号之间工作台数据严格隔离', async () => {
        const { WorkbenchService } = await import('../../api/services/core/WorkbenchService.js');
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        // 仅在账号 1 下创建机会卡
        ResearchOpportunityService.createOpportunity({
            accountId: 1,
            title: '账号1专有选题',
            targetAudience: '受众1',
            scenario: '场景1',
            problem: '问题1',
            uniqueAngle: '切角1',
            contentFormat: 'TUTORIAL',
            expectedOutcome: 'TRUST'
        });

        // 账号 2 查询工作台，不应看到账号 1 的机会卡
        const wb2 = WorkbenchService.getTodayWorkbench(2);
        expect(wb2.account_name).toBe('其他博主');
        expect(wb2.today_actions.pending_opportunities).toHaveLength(0);
    });
});
