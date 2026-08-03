/**
 * 文件功能：竞品笔记 AI 拆解服务，对竞品笔记进行深度分析
 * 主要类/函数：CompetitorNoteAnalyzer
 * 作者：AI Assistant
 * 创建时间：2026-07-31
 */

import { AIFactory } from './AIFactory.js';
import { Logger } from '../LoggerService.js';
import { DemoService } from '../DemoService.js';

/**
 * 竞品笔记分析结果接口
 * 包含标题技巧、封面分析、结构分析、钩子手法、写作要点、关键句子和仿写选项
 */
export interface CompetitorNoteAnalysis {
    /** 标题技巧分析 */
    title_technique: string;
    /** 封面分析 */
    cover_analysis: string;
    /** 结构分析 */
    structure_analysis: string;
    /** 钩子手法分析 */
    hook_technique: string;
    /** 写作要点/学习要点列表 */
    writing_tips: string[];
    /** 关键句子列表（可复制参考） */
    key_sentences: string[];
    /** 仿写选项列表 */
    copy_options: string[];
}

/**
 * 竞品笔记 AI 拆解服务
 *
 * 功能说明：
 * - 对竞品笔记进行多维度 AI 分析，包括标题、封面、结构、钩子等
 * - 提取可用于仿写的关键句子和要点
 * - 生成仿写选项供创作者参考
 *
 * 使用示例：
 * ```typescript
 * const analysis = await CompetitorNoteAnalyzer.analyzeNote({
 *     title: '碎花裙+针织开衫温柔春日穿搭',
 *     content: '...',
 *     cover_description: '柔和色调的穿搭照片',
 *     likes: 2300, collects: 890, comments: 120
 * });
 * console.log(`标题技巧: ${analysis.title_technique}`);
 * ```
 */
/**
 * 竞品笔记数据输入类型
 * 包含分析所需的笔记元信息、数据表现和内容
 */
export interface CompetitorNoteData {
    /** 笔记标题 */
    title?: string;
    /** 笔记正文内容 */
    content?: string;
    /** 封面图片描述 */
    cover_description?: string;
    /** 点赞数 */
    likes?: number;
    /** 收藏数 */
    collects?: number;
    /** 评论数 */
    comments?: number;
    /** 阅读/曝光数 */
    views?: number;
}

export class CompetitorNoteAnalyzer {

    /**
     * 对竞品笔记数据进行多维度 AI 分析拆解
     *
     * 参数说明：
     * - noteData: [CompetitorNoteData] 笔记数据，含 title、content、cover_description、likes、collects、comments
     *
     * 返回说明：
     * - CompetitorNoteAnalysis 包含 title_technique、cover_analysis、structure_analysis、
     *   hook_technique、writing_tips、key_sentences、copy_options
     *
     * 异常情况：
     * - Demo 模式下返回模拟数据
     * - AI 调用失败时抛出异常
     *
     * 使用示例：
     * >>> const result = await CompetitorNoteAnalyzer.analyzeNote({ title: '...', content: '...' });
     * >>> console.log(result.hook_technique);
     */
    static async analyzeNote(noteData: CompetitorNoteData): Promise<CompetitorNoteAnalysis> {
        // Demo 模式：无 API Key 时返回模拟数据
        const isDemo = await DemoService.isDemoMode();
        if (isDemo) {
            Logger.info('CompetitorNoteAnalyzer', 'Demo mode: returning mock analysis');
            return this.getMockAnalysis(noteData);
        }

        Logger.info('CompetitorNoteAnalyzer', 'Analyzing competitor note...', {
            title: noteData.title?.substring(0, 30)
        });

        const provider = AIFactory.getTextProvider();

        // 构建分析提示词
        const systemPrompt = `你是一名资深的小红书内容策略分析师，擅长拆解爆款笔记的创作逻辑。

【分析维度】
1. **标题技巧(title_technique)**：分析标题使用了哪些吸引人的技巧（数字钩子、悬念、痛点、对比、标签词缀等），为什么这个标题有效
2. **封面分析(cover_analysis)**：从视觉角度分析封面设计的思路（配色、排版、信息层级、情绪传达），如果只提供了封面描述则基于描述推测
3. **结构分析(structure_analysis)**：拆解正文/脚本的整体结构框架（开头-中间-结尾的布局、信息密度、节奏控制）
4. **钩子手法(hook_technique)**：分析开头的钩子技巧（提问式、数据式、故事式、冲突式等），为什么能留住读者
5. **写作要点(writing_tips)**：提炼出 3-5 个可供学习的写作技巧，每条用简明中文描述
6. **关键句子(key_sentences)**：从正文中提取 3-5 个最值得借鉴的句子（如果原文中没有则根据分析生成可参考的句式）
7. **仿写选项(copy_options)**：提供 2-3 个基于该笔记结构的仿写选题/方向

【输出要求】
请严格按以下 JSON 格式返回分析结果（不要包含多余内容）：
{
  "title_technique": "标题技巧分析的文字描述",
  "cover_analysis": "封面分析的文字描述",
  "structure_analysis": "结构分析的文字描述",
  "hook_technique": "钩子手法分析的文字描述",
  "writing_tips": ["写作技巧1", "写作技巧2", "写作技巧3"],
  "key_sentences": ["关键句子1", "关键句子2", "关键句子3"],
  "copy_options": ["仿写选题1", "仿写选题2", "仿写选题3"]
}`;

        // 构建笔记数据描述
        const hasContent = noteData.content && noteData.content.trim().length > 0;
        const metricsInfo = [
            noteData.likes ? `点赞: ${noteData.likes}` : '',
            noteData.collects ? `收藏: ${noteData.collects}` : '',
            noteData.comments ? `评论: ${noteData.comments}` : '',
            noteData.views ? `阅读: ${noteData.views}` : ''
        ].filter(Boolean).join(', ');

        const userPrompt = `请分析以下小红书竞品笔记：

【笔记标题】
${noteData.title || '无标题'}

【数据表现】
${metricsInfo || '暂无数据'}

【封面描述】
${noteData.cover_description || '未提供封面描述，请根据标题和数据表现推测封面风格'}

【笔记正文/内容】
${hasContent ? noteData.content!.substring(0, 2000) : '未提供正文内容，请根据标题推测内容结构'}`;

        try {
            const result = await provider.generateJSON<CompetitorNoteAnalysis>([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);

            // 数据校验：确保数组字段为有效数组
            result.writing_tips = Array.isArray(result.writing_tips) ? result.writing_tips : [];
            result.key_sentences = Array.isArray(result.key_sentences) ? result.key_sentences : [];
            result.copy_options = Array.isArray(result.copy_options) ? result.copy_options : [];

            Logger.info('CompetitorNoteAnalyzer', 'Note analysis completed', {
                title: noteData.title?.substring(0, 30)
            });
            return result;
        } catch (error: any) {
            Logger.error('CompetitorNoteAnalyzer', 'Note analysis failed', error);
            throw new Error(`竞品笔记分析失败: ${error.message}`);
        }
    }

    /**
     * 返回模拟的竞品笔记分析数据，用于 Demo 模式演示
     *
     * 参数说明：
     * - noteData: [object] 笔记数据（用于生成个性化 mock 标题）
     *
     * 返回说明：
     * - CompetitorNoteAnalysis 包含预设的分析结果
     */
    private static getMockAnalysis(noteData: CompetitorNoteData): CompetitorNoteAnalysis {
        const title = noteData.title || '未知标题';
        return {
            title_technique: `标题"${title}"采用了"场景代入+结果暗示"的组合技巧。通过具体场景引发读者共鸣，再暗示观看后的收益，形成"痛点-方案"的吸引力闭环。标题长度适中（约15-20字），便于在信息流中完整展示`,
            cover_analysis: '封面采用柔和暖色调，主体居中构图，视觉焦点明确。文字叠加简洁有力，使用关键词标签增强搜索匹配度。整体风格统一，符合该垂类用户的审美偏好，第一眼能快速传达内容主题',
            structure_analysis: '正文采用"钩子引入-场景描述-干货分点-情感升华-行动号召"的五段式结构。每个分点独立成段，用序号或符号分隔，视觉上清晰易读。信息密度适中，不堆砌不空洞，在干货和可读性之间取得良好平衡',
            hook_technique: '开头使用"情境共鸣法"：先用"最近很多姐妹问我..."这类句式拉近与读者的心理距离，暗示这是一篇基于真实需求的内容。后续用数字或对比强化说服力，让读者产生"不看就亏了"的心理',
            writing_tips: [
                '使用具体场景描述替代抽象概念，让读者能"脑补"画面',
                '每段控制在3行以内，善用换行和分段增强阅读节奏',
                '在干货中间穿插个人体验或小故事增加可信度',
                '结尾处设置互动话题引导评论，提升互动率',
                '标题中嵌入垂类核心关键词，提高搜索曝光'
            ],
            key_sentences: [
                '最近后台收到了好多姐妹的私信，都在问...',
                '今天就来分享几套我最近超爱的...',
                '建议选择浅色系，整体色调统一又高级',
                '穿上去就像韩剧女主，温柔感直接拉满',
                '记得收藏起来，下次搭配的时候翻出来看'
            ],
            copy_options: [
                `仿写选题：用"${title}"的结构改写你的垂类内容`,
                '仿写选题：替换场景细节，保持同样的"痛点+方案"结构',
                '仿写选题：将数字钩子和清单体结合，创作同类内容的升级版'
            ]
        };
    }
}
