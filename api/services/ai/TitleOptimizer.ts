import { AIFactory } from './AIFactory.js';
import { Logger } from '../LoggerService.js';
import { DemoService } from '../DemoService.js';

/**
 * 标题分析结果接口
 * 包含评分、各维度得分、优化建议和标题变体
 */
export interface TitleAnalysis {
    /** 综合评分 0-100 */
    score: number;
    /** 各维度得分明细 */
    breakdown: {
        /** 钩子吸引力 0-10 */
        hook_strength: number;
        /** 关键词匹配度 0-10 */
        keyword_relevance: number;
        /** 情绪感染力 0-10 */
        emotional_appeal: number;
        /** 清晰度 0-10 */
        clarity: number;
        /** 长度是否最优(15-25字) */
        length_optimal: boolean;
    };
    /** 3-5个具体优化建议 */
    suggestions: string[];
    /** 3个优化后的标题变体(每个变体标注技巧) */
    variants: string[];
}

/**
 * 标题优化服务
 *
 * 功能说明：
 * - 分析小红书笔记标题的各维度质量
 * - 提供评分和具体优化建议
 * - 生成优化后的标题变体参考
 *
 * 使用示例：
 * ```typescript
 * const analysis = await TitleOptimizer.analyzeTitle(
 *     '零基础学Python的教程',
 *     '编程学习',
 *     'note'
 * );
 * console.log(`评分: ${analysis.score}`);
 * console.log(`建议: ${analysis.suggestions.join(', ')}`);
 * ```
 */
export class TitleOptimizer {

    /**
     * 分析小红书标题并返回评分与优化建议
     *
     * 参数说明：
     * - title: str 笔记原标题
     * - niche?: str 内容垂类（如"穿搭"、"编程学习"）
     * - noteType?: str 笔记类型（note / article / video_script）
     *
     * 返回说明：
     * - TitleAnalysis 包含 score、breakdown、suggestions、variants
     *
     * 异常情况：
     * - Demo 模式下返回模拟数据
     * - AI 调用失败时抛出异常
     */
    static async analyzeTitle(
        title: string,
        niche?: string,
        noteType?: string
    ): Promise<TitleAnalysis> {
        // Demo 模式：无 API Key 时返回模拟数据
        const isDemo = await DemoService.isDemoMode();
        if (isDemo) {
            Logger.info('TitleOptimizer', 'Demo mode: returning mock title analysis');
            return this.getMockAnalysis();
        }

        const provider = AIFactory.getTextProvider();

        // 小红书标题分析系统提示词
        const systemPrompt = `你是一名专业的小红书内容运营专家，擅长分析笔记标题的吸引力和传播潜力。

【分析维度】
1. **钩子吸引力(hook_strength 0-10)**：标题开头能否快速抓住注意力？是否使用了数字、悬念、对比、痛点等钩子技巧？
2. **关键词匹配度(keyword_relevance 0-10)**：标题是否包含目标受众会搜索的关键词？是否覆盖了垂类核心词和长尾词？
3. **情绪感染力(emotional_appeal 0-10)**：标题是否引发好奇、共鸣、紧迫感等情绪？是否使用了感叹号、问号等情绪符号？
4. **清晰度(clarity 0-10)**：标题的核心信息是否清晰易懂？读者能否秒懂这篇笔记要讲什么？
5. **长度最优性(length_optimal)**：标题长度是否在15-25字之间？这个长度既能传达足够信息，又不会在列表中截断。

【评分规则】
- 综合评分(score) = 各维度得分加权计算，范围 0-100
- 每个维度单独打分 0-10
- length_optimal 为布尔值，不影响 score 计算

【输出要求】
返回严格的 JSON 格式，结构如下：
{
  "score": 数字(0-100),
  "breakdown": {
    "hook_strength": 数字(0-10),
    "keyword_relevance": 数字(0-10),
    "emotional_appeal": 数字(0-10),
    "clarity": 数字(0-10),
    "length_optimal": true/false
  },
  "suggestions": ["建议1", "建议2", "建议3", ...],
  "variants": ["变体1", "变体2", "变体3"]
}

【标题变体生成技巧】
- 数字钩子法：在开头加入数字增强吸引力
- 痛点共鸣法：点出目标用户的真实痛点
- 结果承诺法：暗示看完能获得的收益
- 悬念反问法：用问句引发好奇心
- 标签词缀法：加入"干货""避坑""保姆级"等平台热门标签词`;

        const nicheHint = niche ? `该笔记属于"${niche}"垂类，请结合该垂类的标题特点进行分析。` : '';
        const userPrompt = `请分析以下小红书笔记标题：

标题：${title}
${nicheHint ? nicheHint + '\n' : ''}${noteType ? `笔记类型：${noteType}` : ''}`;

        try {
            Logger.info('TitleOptimizer', 'Analyzing title...', { title, niche, noteType });
            const result = await provider.generateJSON<TitleAnalysis>([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);

            // 数据校验：确保返回结果在合理范围内
            result.score = Math.max(0, Math.min(100, Math.round(result.score)));
            const breakdown = result.breakdown;
            breakdown.hook_strength = Math.max(0, Math.min(10, breakdown.hook_strength));
            breakdown.keyword_relevance = Math.max(0, Math.min(10, breakdown.keyword_relevance));
            breakdown.emotional_appeal = Math.max(0, Math.min(10, breakdown.emotional_appeal));
            breakdown.clarity = Math.max(0, Math.min(10, breakdown.clarity));

            Logger.info('TitleOptimizer', 'Title analysis completed', { score: result.score });
            return result;
        } catch (error: any) {
            Logger.error('TitleOptimizer', 'Title analysis failed', error);
            throw new Error(`标题分析失败: ${error.message}`);
        }
    }

    /**
     * 返回模拟的标题分析数据，用于 Demo 模式演示
     *
     * 返回说明：
     * - TitleAnalysis 包含预设的评分和优化建议
     */
    private static getMockAnalysis(): TitleAnalysis {
        return {
            score: 78,
            breakdown: {
                hook_strength: 7,
                keyword_relevance: 8,
                emotional_appeal: 8,
                clarity: 7,
                length_optimal: true
            },
            suggestions: [
                '标题可以在开头增加数字来增强吸引力',
                '加入"干货分享"等标签型关键词',
                '使用感叹号或问号增加互动感'
            ],
            variants: [
                '3天学会Python！零基础也能看懂的保姆级教程',
                '后悔没早看！Python入门避坑指南（附学习路线）',
                'Python自学的7个高效方法，第3个太绝了'
            ]
        };
    }
}
