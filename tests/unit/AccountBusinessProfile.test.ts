import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('AccountBusinessProfileService (P1.1 账号经营档案)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        // 种子账号
        const db = getTestDbSync();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '测试博主', 1)").run();
    });

    it('能够为指定账号保存并读取完整的账号经营档案（包含目标、受众、独特资产、内容栏目、表达禁区）', async () => {
        const { AccountBusinessProfileService } = await import('../../api/services/core/AccountBusinessProfileService.js');

        const profileData = {
            accountId: 1,
            goals: ['建立专业技术信任', '获得商业定制咨询'],
            targetAudience: {
                identity: '自动化/嵌入式/自媒体开发者与硬件爱好者',
                painPoints: ['算法复现困难', '选型踩坑多', '缺乏现成工程参考'],
                misconceptions: ['以为写几句Prompt就能代替真实硬件驱动']
            },
            uniqueCapabilities: [
                '拥有真实工业视觉与嵌入式硬件实战经验',
                '坚持提供真实运行数据与测试用例，非玩具实现'
            ],
            contentPillars: [
                { name: '硬件避坑', description: '分享真实芯片与传感器踩坑经历', targetRatio: 40 },
                { name: '工程实操', description: '代码级拆解与高精度调优教程', targetRatio: 40 },
                { name: '行业见解', description: '开源生态与技术选型客观评测', targetRatio: 20 }
            ],
            expressionBoundaries: [
                '不宣称100%零封号或诱导违规爬虫',
                '不搬运抄袭竞品原文原句',
                '涉及未验证概念时必须明确声明'
            ],
            toneStyle: '技术严谨、客观实用、平铺直叙、拒绝空洞形容词'
        };

        AccountBusinessProfileService.saveProfile(profileData);

        const saved = AccountBusinessProfileService.getProfile(1);
        expect(saved).toBeDefined();
        expect(saved?.accountId).toBe(1);
        expect(saved?.goals).toEqual(profileData.goals);
        expect(saved?.targetAudience.identity).toBe(profileData.targetAudience.identity);
        expect(saved?.contentPillars).toHaveLength(3);
        expect(saved?.expressionBoundaries).toHaveLength(3);
        expect(saved?.toneStyle).toContain('技术严谨');
    });

    it('当账号尚未配置经营档案时，返回包含合理默认值的空档案框架而非报错', async () => {
        const { AccountBusinessProfileService } = await import('../../api/services/core/AccountBusinessProfileService.js');
        const emptyProfile = AccountBusinessProfileService.getProfile(1);

        expect(emptyProfile).toBeDefined();
        expect(emptyProfile?.accountId).toBe(1);
        expect(emptyProfile?.goals).toEqual([]);
        expect(emptyProfile?.contentPillars).toEqual([]);
        expect(emptyProfile?.isComplete).toBe(false);
    });

    it('能够将账号经营档案转换为供 AI 生成与选题校验使用的结构化提示词上下文（exportPromptContext）', async () => {
        const { AccountBusinessProfileService } = await import('../../api/services/core/AccountBusinessProfileService.js');

        AccountBusinessProfileService.saveProfile({
            accountId: 1,
            goals: ['建立专业技术信任'],
            targetAudience: {
                identity: '机器人开发者',
                painPoints: ['云台抖动'],
                misconceptions: []
            },
            uniqueCapabilities: ['自研高精度防抖算法'],
            contentPillars: [
                { name: '云台调优', description: '消除抖动', targetRatio: 50 }
            ],
            expressionBoundaries: ['不夸大参数性能'],
            toneStyle: '硬核、数据说话'
        });

        const contextText = AccountBusinessProfileService.exportPromptContext(1);
        expect(contextText).toContain('【账号经营定位与人设约束】');
        expect(contextText).toContain('目标受众: 机器人开发者');
        expect(contextText).toContain('独特能力与资产: 自研高精度防抖算法');
        expect(contextText).toContain('内容栏目: 云台调优');
        expect(contextText).toContain('表达红线与禁区: 不夸大参数性能');
        expect(contextText).toContain('语言基调: 硬核、数据说话');
    });
});
