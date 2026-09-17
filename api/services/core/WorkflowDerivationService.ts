import { ContentPackageService, ContentPackage } from './ContentPackageService.js';
import { AccountBusinessProfileService } from './AccountBusinessProfileService.js';
import { ResearchOpportunityService } from './ResearchOpportunityService.js';
import { VideoProjectService, VideoProject } from '../video/VideoProjectService.js';

export type PlatformTarget = 'WECHAT_ARTICLE' | 'VIDEO_SCRIPT' | 'WEIBO_POST';

export interface VideoScriptScene {
    sceneNumber: number;
    visualDescription: string;
    narration: string;
    audioCue?: string;
    durationSeconds: number;
}

export interface DerivedContent {
    packageId: string;
    platform: PlatformTarget;
    title: string;
    content: string;
    scenes?: VideoScriptScene[];
    estimatedDurationSeconds?: number;
    tags: string[];
    createdAt: string;
}

export interface McpToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
    };
}

export class WorkflowDerivationService {
    /**
     * 将小红书内容包跨平台派生为其他形态（公众号、分镜视频脚本、微博）
     */
    static deriveContent(packageId: string, platform: PlatformTarget): DerivedContent {
        const pkg = ContentPackageService.getPackage(packageId);
        if (!pkg) {
            throw new Error(`内容包不存在: ${packageId}`);
        }

        switch (platform) {
            case 'WECHAT_ARTICLE':
                return this.deriveWechatArticle(pkg);
            case 'VIDEO_SCRIPT':
                return this.deriveVideoScript(pkg);
            case 'WEIBO_POST':
                return this.deriveWeiboPost(pkg);
            default:
                throw new Error(`不支持的派生目标平台: ${platform}`);
        }
    }

    private static deriveWechatArticle(pkg: ContentPackage): DerivedContent {
        const title = `【深度实操】${pkg.title}`;
        const keyPointsList = pkg.keyPoints.map((kp, idx) => `${idx + 1}. **${kp}**`).join('\n');

        const articleMarkdown = [
            `# ${title}`,
            `\n> **导读金句**：${pkg.coreValueProposition || pkg.title}。如果你也在实际项目中踩坑，这篇文章值得反复研读并实操核验。`,
            `\n## 核心要点一览\n${keyPointsList}`,
            `\n## 正文深度解析`,
            pkg.bodyMarkdown.replace(/^#\s+.*$/m, '').trim(),
            `\n---\n**写在最后**：关注我们获取更多嵌入式硬核实战干货，欢迎在后台留言交流你的调试心得。`
        ].join('\n\n');

        return {
            packageId: pkg.id,
            platform: 'WECHAT_ARTICLE',
            title,
            content: articleMarkdown,
            tags: pkg.tags,
            createdAt: new Date().toISOString()
        };
    }

    private static deriveVideoScript(pkg: ContentPackage): DerivedContent {
        const title = `【短视频脚本】${pkg.title}`;
        const scenes: VideoScriptScene[] = [];
        let totalDuration = 0;

        // 1. 开门见山 Hook
        scenes.push({
            sceneNumber: 1,
            visualDescription: `主播手持产品特写镜头，屏幕出现大红警告字卡：“${pkg.coreValueProposition || '千万别再盲目接线'}”`,
            narration: `先别急着通电！90%的人在做${pkg.title.slice(0, 15)}时，第一步就搞错了！今天用3分钟带你彻底避坑。`,
            audioCue: '急促警示音效 + 动感BGM弱化渐入',
            durationSeconds: 5
        });
        totalDuration += 5;

        // 2. 论点分镜
        pkg.keyPoints.forEach((kp, idx) => {
            const sec = 8;
            scenes.push({
                sceneNumber: idx + 2,
                visualDescription: `特写排查细节/原理图截屏/示波器波形对比，高亮标注关键排查点：${kp}`,
                narration: `第${idx + 1}个关键点：${kp}。注意看这里的回路和参数，很多人就是在这里烧了板子！`,
                audioCue: '重点提示叮一声',
                durationSeconds: sec
            });
            totalDuration += sec;
        });

        // 3. 结尾行动召唤 CTA
        scenes.push({
            sceneNumber: scenes.length + 1,
            visualDescription: '主播对着镜头微笑点头，屏幕浮现点赞关注动效与评论区引导卡',
            narration: '如果这个避坑技巧对你有帮助，赶紧点赞收藏备用，有疑问欢迎在评论区留言交流！',
            audioCue: '欢快收尾音效',
            durationSeconds: 4
        });
        totalDuration += 4;

        const scriptContent = scenes.map(s => 
            `[分镜 ${s.sceneNumber} (${s.durationSeconds}s)]\n【画面】${s.visualDescription}\n【台词】${s.narration}\n【音效】${s.audioCue || '无'}`
        ).join('\n\n');

        return {
            packageId: pkg.id,
            platform: 'VIDEO_SCRIPT',
            title,
            content: scriptContent,
            scenes,
            estimatedDurationSeconds: totalDuration,
            tags: pkg.tags,
            createdAt: new Date().toISOString()
        };
    }

    private static deriveWeiboPost(pkg: ContentPackage): DerivedContent {
        const hashtags = pkg.tags.map(t => `#${t}#`).join(' ');
        const takeaway = pkg.keyPoints.slice(0, 2).map((k, i) => `${i + 1}. ${k}`).join('；');

        const postText = `【实战避坑】${pkg.title}！${pkg.coreValueProposition || ''}\n核心干货：${takeaway}。\n建议转发收藏备查！ ${hashtags}`;

        return {
            packageId: pkg.id,
            platform: 'WEIBO_POST',
            title: pkg.title,
            content: postText.slice(0, 280),
            tags: pkg.tags,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * P3.4 视频流水线联动：将内容包派生的短视频分镜脚本直接转化为视频工坊工程 (VideoProject)
     */
    static convertScriptToVideoProject(packageId: string, createdBy?: number): VideoProject {
        const pkg = ContentPackageService.getPackage(packageId);
        if (!pkg) {
            throw new Error(`内容包不存在: ${packageId}`);
        }

        const derivedVideo = this.deriveVideoScript(pkg);
        const scenesForProject = (derivedVideo.scenes || []).map(s => ({
            visualDescription: s.visualDescription,
            narration: s.narration,
            audio: s.narration,
            visual: s.visualDescription
        }));

        return VideoProjectService.createProject(
            pkg.title,
            { scenes: scenesForProject },
            pkg.coreValueProposition,
            pkg.tags,
            `由内容包 [${pkg.title}] 一键派生视频工程`,
            createdBy
        );
    }

    /**
     * MCP (Model Context Protocol) 工具列表
     */
    static listMcpTools(): McpToolDefinition[] {
        return [
            {
                name: 'chimera_get_account_profile',
                description: '获取指定小红书账号的经营档案与定位设定（目标受众、独特资产、栏目矩阵、表达红线）',
                parameters: {
                    type: 'object',
                    properties: {
                        accountId: { type: 'number', description: '账号 ID' }
                    },
                    required: ['accountId']
                }
            },
            {
                name: 'chimera_list_opportunities',
                description: '查询账号当前选题机会池（Content Opportunities），包含用户原话、痛点与决策状态',
                parameters: {
                    type: 'object',
                    properties: {
                        accountId: { type: 'number', description: '账号 ID' },
                        status: { type: 'string', description: '可选过滤: IDEA, ACCEPTED, DEFERRED, REJECTED' }
                    },
                    required: ['accountId']
                }
            },
            {
                name: 'chimera_get_content_package',
                description: '获取结构化内容包详情与完整版本快照树',
                parameters: {
                    type: 'object',
                    properties: {
                        packageId: { type: 'string', description: '内容包 ID' }
                    },
                    required: ['packageId']
                }
            },
            {
                name: 'chimera_derive_content',
                description: '将指定内容包跨平台派生为微信公众号深度长文、短视频分镜脚本或微博动态',
                parameters: {
                    type: 'object',
                    properties: {
                        packageId: { type: 'string', description: '内容包 ID' },
                        targetPlatform: { type: 'string', enum: ['WECHAT_ARTICLE', 'VIDEO_SCRIPT', 'WEIBO_POST'] }
                    },
                    required: ['packageId', 'targetPlatform']
                }
            },
            {
                name: 'chimera_submit_publish',
                description: '提交内容发布请求。安全硬约束：必须显式传入 confirmedByUser: true，否则将被强制拦截拒绝！',
                parameters: {
                    type: 'object',
                    properties: {
                        packageId: { type: 'string', description: '内容包 ID' },
                        confirmedByUser: { type: 'boolean', description: '创作者人工确认发布标记' }
                    },
                    required: ['packageId', 'confirmedByUser']
                }
            }
        ];
    }

    /**
     * 执行 MCP 工具调用
     */
    static async executeMcpTool(toolName: string, args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
        switch (toolName) {
            case 'chimera_get_account_profile': {
                const profile = AccountBusinessProfileService.getProfile(Number(args.accountId));
                return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
            }

            case 'chimera_list_opportunities': {
                const list = ResearchOpportunityService.listOpportunities(Number(args.accountId), args.status);
                return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
            }

            case 'chimera_get_content_package': {
                const pkg = ContentPackageService.getPackage(args.packageId);
                if (!pkg) throw new Error(`未找到内容包: ${args.packageId}`);
                return { content: [{ type: 'text', text: JSON.stringify(pkg, null, 2) }] };
            }

            case 'chimera_derive_content': {
                const derived = this.deriveContent(args.packageId, args.targetPlatform);
                return { content: [{ type: 'text', text: JSON.stringify(derived, null, 2) }] };
            }

            case 'chimera_submit_publish': {
                if (args.confirmedByUser !== true) {
                    throw new Error('P0 强制安全门禁：未检测到创作者人工显式核准（confirmedByUser 必须为 true）！');
                }
                const syncRes = ContentPackageService.exportToDraft(args.packageId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: '已通过安全前审并注入发布草稿队列',
                            draftId: syncRes.draftId
                        }, null, 2)
                    }]
                };
            }

            default:
                throw new Error(`未知 MCP 工具: ${toolName}`);
        }
    }
}
