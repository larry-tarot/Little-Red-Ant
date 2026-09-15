import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('ContentPackageService (P1.3 内容包与版本化)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '极客博主', 1)").run();
    });

    it('能够创建结构化内容包（关联账号与选题机会卡，包含受众、核心主张、论点卡、正文脚本、首图标题建议）', async () => {
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        const pkg = ContentPackageService.createPackage({
            accountId: 1,
            opportunityId: 'opp-101',
            title: '无刷电机发烫失步自查清单',
            targetAudience: '电赛新手',
            coreValueProposition: '10分钟排查接线与电流闭环设定，告别烧板',
            keyPoints: [
                '检查共地回路与大电流地走线',
                '示波器观察相电流纹波',
                '速度环与位置环增益阶梯调节'
            ],
            bodyMarkdown: '# 无刷电机发烫自查指南\n\n很多人一遇到失步就盲目拉大电流，这往往是炸驱动板的开端...',
            coverTitleOptions: [
                '无刷电机又发烫？3个致命误区排查',
                '电赛人必看：双轴云台防烧板自检清单'
            ],
            tags: ['单片机', '电赛', '无刷电机', '硬件调试']
        });

        expect(pkg.id).toBeDefined();
        expect(pkg.currentVersion).toBe(1);
        expect(pkg.versions).toHaveLength(1);
        expect(pkg.versions[0].versionNumber).toBe(1);
        expect(pkg.versions[0].changeSummary).toBe('初始创建版本');
        expect(pkg.keyPoints).toHaveLength(3);
        expect(pkg.coverTitleOptions).toContain('无刷电机又发烫？3个致命误区排查');
    });

    it('保存或修改内容包时自动生成不可变版本快照，支持按版本追溯与差异对比', async () => {
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        const pkg = ContentPackageService.createPackage({
            accountId: 1,
            title: '第一版草稿',
            bodyMarkdown: '初版正文内容',
            keyPoints: ['要点1']
        });

        // 保存新版本（例如：AI 去味重写或创作者人工润色）
        const updated = ContentPackageService.commitVersion(pkg.id, {
            title: '第二版：更犀利的标题',
            bodyMarkdown: '第二版正文内容：加入了具体的参数和电路图解读',
            keyPoints: ['要点1', '要点2（新增实测数据）'],
            changeSummary: '优化了语言基调，补充实测温升图'
        });

        expect(updated.currentVersion).toBe(2);
        expect(updated.versions).toHaveLength(2);
        expect(updated.versions[1].changeSummary).toBe('优化了语言基调，补充实测温升图');

        // 查询指定历史版本
        const v1 = ContentPackageService.getPackageVersion(pkg.id, 1);
        expect(v1?.title).toBe('第一版草稿');
        expect(v1?.bodyMarkdown).toBe('初版正文内容');

        const v2 = ContentPackageService.getPackageVersion(pkg.id, 2);
        expect(v2?.title).toBe('第二版：更犀利的标题');
    });

    it('支持一键将内容包当前版本同步导出为可发布的传统 Draft 草稿', async () => {
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        const pkg = ContentPackageService.createPackage({
            accountId: 1,
            title: '无刷电机防烧实战指南',
            bodyMarkdown: '正文完整长文干货...',
            tags: ['嵌入式', '云台']
        });

        const syncResult = ContentPackageService.exportToDraft(pkg.id);
        expect(syncResult.draftId).toBeGreaterThan(0);

        // 验证 SQLite drafts 表中真实写入
        const db = getTestDbSync();
        const draftRow = db.prepare('SELECT * FROM drafts WHERE id = ?').get(syncResult.draftId) as any;
        expect(draftRow).toBeDefined();
        expect(draftRow.title).toBe('无刷电机防烧实战指南');
        expect(draftRow.content).toContain('正文完整长文干货');
    });
});
