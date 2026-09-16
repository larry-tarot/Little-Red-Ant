import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('DemandRadarService (P2.1 自动需求雷达与机会推荐)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '硬件博主', 1)").run();
    });

    it('能够注册并管理关键词监控雷达（包含目标受众、预期分类、扫描频率与阈值）', async () => {
        const { DemandRadarService } = await import('../../api/services/core/DemandRadarService.js');

        const radar = DemandRadarService.addKeywordWatch({
            accountId: 1,
            keyword: '无刷电机发烫',
            category: '硬件避坑',
            targetAudience: '电赛新手',
            minLikesThreshold: 50
        });

        expect(radar.id).toBeDefined();
        expect(radar.keyword).toBe('无刷电机发烫');
        expect(radar.isActive).toBe(true);

        const list = DemandRadarService.listWatches(1);
        expect(list).toHaveLength(1);
        expect(list[0].keyword).toBe('无刷电机发烫');
    });

    it('能够从监控热点/评论中自动聚类提取痛点，并合成推荐选题（Opportunity Candidates）', async () => {
        const { DemandRadarService } = await import('../../api/services/core/DemandRadarService.js');

        // 模拟外部/爬虫同步进来的高频评论和热帖样本
        const signals = [
            {
                sourceType: 'COMMENT' as const,
                rawText: '电机死区时间没给够，上桥下桥同时导通直接炸管发烫！',
                author: '小工匠',
                likes: 120
            },
            {
                sourceType: 'COMMENT' as const,
                rawText: '我的双轴云台接线地线共地没接好，单片机被反电动势打烧了...',
                author: 'STM32学习者',
                likes: 85
            }
        ];

        const candidate = DemandRadarService.synthesizeCandidate({
            accountId: 1,
            keyword: '无刷电机发烫',
            signals,
            targetAudience: '电赛初学者',
            scenario: '电机接线调试通电瞬间'
        });

        expect(candidate.title).toContain('无刷电机发烫');
        expect(candidate.problem).toBeDefined();
        expect(candidate.uniqueAngle).toBeDefined();
        expect(candidate.evidenceCount).toBe(2);
    });

    it('支持创作者一键将雷达候选机会采纳并无缝导入 P1.2 内容机会卡池（Content Opportunities）', async () => {
        const { DemandRadarService } = await import('../../api/services/core/DemandRadarService.js');
        const { ResearchOpportunityService } = await import('../../api/services/core/ResearchOpportunityService.js');

        const signals = [
            {
                sourceType: 'COMMENT' as const,
                rawText: '为什么405nm滤光片在大太阳底下还是有光斑漂移？',
                author: '视觉新手',
                likes: 45
            }
        ];

        const candidate = DemandRadarService.synthesizeCandidate({
            accountId: 1,
            keyword: '405nm滤光片',
            signals,
            targetAudience: '电赛机器视觉组',
            scenario: '户外强光激光追踪测试'
        });

        // 一键采纳为正式机会卡
        const opp = DemandRadarService.adoptCandidateToOpportunity(candidate);
        expect(opp.id).toBeDefined();
        expect(opp.status).toBe('ACCEPTED');
        expect(opp.title).toContain('405nm滤光片');

        // 验证在 P1.2 的机会卡列表和证据表中完整落库并已关联
        const oppList = ResearchOpportunityService.listOpportunities(1);
        expect(oppList.some(o => o.id === opp.id)).toBe(true);

        const evList = ResearchOpportunityService.listEvidence(1);
        expect(evList.some(e => e.rawText.includes('405nm滤光片在大太阳底下'))).toBe(true);
    });
});
