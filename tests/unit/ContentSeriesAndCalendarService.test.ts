import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('ContentSeriesAndCalendarService (P3.2 系列日历与跨账号协同矩阵)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT OR REPLACE INTO accounts (id, nickname, is_active) VALUES (1, '极客主号', 1)").run();
        db.prepare("INSERT OR REPLACE INTO accounts (id, nickname, is_active) VALUES (2, '备用硬件号', 1)").run();

        // 为主号设置 P1.1 栏目配比 (Content Pillars)
        const { AccountBusinessProfileService } = await import('../../api/services/core/AccountBusinessProfileService.js');
        AccountBusinessProfileService.saveProfile({
            accountId: 1,
            goals: ['电赛建立信任'],
            targetAudience: { identity: '电赛新手', painPoints: [], misconceptions: [] },
            uniqueCapabilities: ['5年实战'],
            contentPillars: [
                { name: '硬件避坑', description: '接线与防烧', targetRatio: 50 },
                { name: '代码实操', description: 'PID与算法', targetRatio: 30 },
                { name: '赛事科普', description: '规则与准备', targetRatio: 20 }
            ],
            expressionBoundaries: [],
            toneStyle: '硬核'
        });
    });

    it('能够创建并管理系列专栏（Content Series），关联栏目与规划篇数', async () => {
        const { ContentSeriesService } = await import('../../api/services/core/ContentSeriesService.js');

        const series = ContentSeriesService.createSeries({
            accountId: 1,
            title: '无刷云台调参30讲',
            description: '从机械安装、电路共地到双环PID手把手全解',
            targetPillar: '硬件避坑',
            plannedCount: 10
        });

        expect(series.id).toBeDefined();
        expect(series.title).toBe('无刷云台调参30讲');
        expect(series.plannedCount).toBe(10);
        expect(series.completedCount).toBe(0);
        expect(series.status).toBe('ACTIVE');

        const list = ContentSeriesService.listSeries(1);
        expect(list).toHaveLength(1);
        expect(list[0].title).toBe('无刷云台调参30讲');
    });

    it('能够将内容包关联至系列，并自动更新系列的完成进度', async () => {
        const { ContentSeriesService } = await import('../../api/services/core/ContentSeriesService.js');
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        const series = ContentSeriesService.createSeries({
            accountId: 1,
            title: '电赛视觉从零到一',
            targetPillar: '代码实操',
            plannedCount: 2
        });

        // 创建内容包并加入该系列
        const pkg1 = ContentPackageService.createPackage({
            accountId: 1,
            title: '第1讲：MaixCAM环境搭建',
            bodyMarkdown: '正文...'
        });

        ContentSeriesService.attachPackageToSeries(series.id, pkg1.id);

        const updatedSeries = ContentSeriesService.getSeries(series.id);
        expect(updatedSeries?.completedCount).toBe(1);
        expect(updatedSeries?.progressPercentage).toBe(50);
    });

    it('能够根据 P1.1 账号经营档案的内容栏目配比，计算当前内容的健康均衡度（Pillar Balance）', async () => {
        const { ContentSeriesService } = await import('../../api/services/core/ContentSeriesService.js');
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        // 创建 3 个内容包，全部分布在“硬件避坑”栏目
        for (let i = 0; i < 3; i++) {
            ContentPackageService.createPackage({
                accountId: 1,
                title: `硬件避坑文章 ${i + 1}`,
                bodyMarkdown: '...',
                tags: ['硬件避坑']
            });
        }

        const balance = ContentSeriesService.checkPillarBalance(1);
        expect(balance.pillars).toHaveLength(3);
        // 发现硬件避坑占比过高 (100% vs 目标 50%)
        const hwPillar = balance.pillars.find(p => p.name === '硬件避坑');
        expect(hwPillar?.currentCount).toBe(3);
        expect(hwPillar?.status).toBe('OVER'); // 扎堆偏多

        const codePillar = balance.pillars.find(p => p.name === '代码实操');
        expect(codePillar?.currentCount).toBe(0);
        expect(codePillar?.status).toBe('UNDER'); // 偏低需补充
    });

    it('支持跨账号协同矩阵总览（Multi-Account Matrix Overview）', async () => {
        const { ContentSeriesService } = await import('../../api/services/core/ContentSeriesService.js');

        const matrix = ContentSeriesService.getMultiAccountMatrix();
        expect(matrix).toHaveLength(2);
        expect(matrix.find(m => m.accountId === 1)?.nickname).toBe('极客主号');
        expect(matrix.find(m => m.accountId === 2)?.nickname).toBe('备用硬件号');
    });
});
