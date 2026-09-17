import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('WorkflowDerivationService (P3.3 跨平台派生与MCP能力)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT OR REPLACE INTO accounts (id, nickname, is_active) VALUES (1, '极客博主', 1)").run();

        // 创建一个标准内容包
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');
        ContentPackageService.createPackage({
            accountId: 1,
            title: '无刷电机抗日光调试与防烧实战',
            targetAudience: '电赛初学者',
            coreValueProposition: '消除发热与光斑冲刷，调试一次通关',
            keyPoints: [
                '区分功率地与小信号地，避免MCU共地烧管',
                '示波器监测相电流纹波，调小速度环I增益',
                '装配405nm狭带滤光片抑制户外强光干扰'
            ],
            bodyMarkdown: '# 无刷电机抗日光调试指南\n\n很多人一到户外调试就发现光斑漂移严重甚至电机发烫烧管...\n\n排查第一步看地线，第二步看波形，第三步加滤光片。',
            tags: ['单片机', 'STM32', '无刷电机']
        });
    });

    it('能够将小红书图文内容包一键派生为微信公众号深度长文（包含大标题、金句导读、体系化分段与关注引导）', async () => {
        const { WorkflowDerivationService } = await import('../../api/services/core/WorkflowDerivationService.js');
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        const pkgs = ContentPackageService.listPackages(1);
        const pkgId = pkgs[0].id;

        const wechatArticle = WorkflowDerivationService.deriveContent(pkgId, 'WECHAT_ARTICLE');
        expect(wechatArticle.platform).toBe('WECHAT_ARTICLE');
        expect(wechatArticle.title).toBeDefined();
        expect(wechatArticle.content).toContain('## 核心要点一览');
        expect(wechatArticle.content).toContain('区分功率地与小信号地');
        expect(wechatArticle.content).toContain('关注我们获取更多嵌入式硬核实战');
    });

    it('能够将内容包一键派生为短视频分镜头脚本（分镜编号、画面描述、口播台词、音效提示）', async () => {
        const { WorkflowDerivationService } = await import('../../api/services/core/WorkflowDerivationService.js');
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        const pkgs = ContentPackageService.listPackages(1);
        const pkgId = pkgs[0].id;

        const videoScript = WorkflowDerivationService.deriveContent(pkgId, 'VIDEO_SCRIPT');
        expect(videoScript.platform).toBe('VIDEO_SCRIPT');
        expect(videoScript.scenes).toBeDefined();
        expect(videoScript.scenes!.length).toBeGreaterThanOrEqual(3);
        expect(videoScript.scenes![0].visualDescription).toBeDefined();
        expect(videoScript.scenes![0].narration).toBeDefined();
        expect(videoScript.estimatedDurationSeconds).toBeGreaterThan(15);
    });

    it('能够将内容包一键派生为微博/即刻短动态（痛点先行、精炼要点、话题标签）', async () => {
        const { WorkflowDerivationService } = await import('../../api/services/core/WorkflowDerivationService.js');
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');

        const pkgs = ContentPackageService.listPackages(1);
        const pkgId = pkgs[0].id;

        const weibo = WorkflowDerivationService.deriveContent(pkgId, 'WEIBO_POST');
        expect(weibo.platform).toBe('WEIBO_POST');
        expect(weibo.content.length).toBeLessThan(300);
        expect(weibo.content).toContain('#单片机#');
    });

    it('符合标准 MCP (Model Context Protocol) 契约，支持外部 Agent 查询内容包与安全受控发布', async () => {
        const { WorkflowDerivationService } = await import('../../api/services/core/WorkflowDerivationService.js');

        const tools = WorkflowDerivationService.listMcpTools();
        expect(tools.some(t => t.name === 'chimera_get_content_package')).toBe(true);
        expect(tools.some(t => t.name === 'chimera_derive_content')).toBe(true);
        expect(tools.some(t => t.name === 'chimera_submit_publish')).toBe(true);

        // 调用 MCP tool 获取内容包
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');
        const pkg = ContentPackageService.listPackages(1)[0];

        const toolResult = await WorkflowDerivationService.executeMcpTool('chimera_get_content_package', {
            packageId: pkg.id
        });

        expect(toolResult.content).toBeDefined();
        expect(toolResult.content[0].text).toContain('无刷电机抗日光调试与防烧实战');

        // 调用 MCP tool 尝试发布时，若未人工确认必须拒绝
        await expect(WorkflowDerivationService.executeMcpTool('chimera_submit_publish', {
            packageId: pkg.id,
            confirmedByUser: false
        })).rejects.toThrow('强制安全门禁');
    });
});
