/**
 * 文件功能：AI 复盘服务，生成周期性的数据分析报告
 * 主要类/函数：AIReviewService
 * 作者：AI Assistant
 * 创建时间：2026-07-31
 */

import { AIFactory } from './AIFactory.js';
import { Logger } from '../LoggerService.js';
import { DemoService } from '../DemoService.js';
import { AnalyticsService } from '../core/AnalyticsService.js';
import db from '../../db.js';

/**
 * AI 复盘分析结果接口
 * 包含总结、亮点、问题、建议及最佳/最差笔记分析
 */
export interface ReviewResult {
    /** 一句话总结 */
    summary: string;
    /** 亮点列表 */
    highlights: string[];
    /** 问题列表 */
    concerns: string[];
    /** 建议列表 */
    suggestions: string[];
    /** 表现最好的笔记分析 */
    top_note_analysis: { title: string; reason: string };
    /** 表现最差的笔记分析 */
    worst_note_analysis: { title: string; reason: string };
}

/**
 * AI 复盘服务
 *
 * 功能说明：
 * - 拉取分析数据（摘要、历史趋势、笔记排行）
 * - 通过 AI 生成周期性的数据复盘报告
 * - 支持周复盘和月复盘两种周期
 *
 * 使用示例：
 * ```typescript
 * const review = await AIReviewService.generateReview('week');
 * console.log(`总结: ${review.summary}`);
 * console.log(`亮点: ${review.highlights.join(', ')}`);
 * ```
 */
export class AIReviewService {

    /**
     * 生成指定周期的数据复盘报告
     *
     * 参数说明：
     * - period: 'week' | 'month' 复盘周期，默认 'week'
     *
     * 返回说明：
     * - ReviewResult 包含 summary、highlights、concerns、suggestions、top/worst note 分析
     *
     * 异常情况：
     * - Demo 模式下返回模拟数据
     * - AI 调用失败时抛出异常
     *
     * 使用示例：
     * >>> const review = await AIReviewService.generateReview('month');
     * >>> console.log(review.highlights.length);
     */
    static async generateReview(period: 'week' | 'month' = 'week'): Promise<ReviewResult> {
        // Demo 模式：无 API Key 时返回模拟数据
        const isDemo = await DemoService.isDemoMode();
        if (isDemo) {
            Logger.info('AIReviewService', 'Demo mode: returning mock review data');
            return this.getMockReview(period);
        }

        Logger.info('AIReviewService', `Generating ${period} review...`);

        // 1. 拉取分析数据
        const summary = AnalyticsService.getSummary();
        const history = AnalyticsService.getHistory();

        // 2. 拉取表现最好和最差的笔记
        const topNote = this.getTopNote();
        const worstNote = this.getWorstNote();

        // 3. 构建 AI 上下文数据
        const daysCount = period === 'week' ? 7 : 30;
        const recentHistory = history.slice(-daysCount);

        const dataContext = {
            period: period === 'week' ? '周' : '月',
            account_name: summary.account_name,
            total_notes: summary.total_notes,
            total_views: summary.total_views,
            total_likes: summary.total_likes,
            total_comments: summary.total_comments,
            total_collects: summary.total_collects,
            daily_data: recentHistory,
            top_note: topNote ? { title: topNote.title, views: topNote.views, likes: topNote.likes, comments: topNote.comments, collects: topNote.collects } : null,
            worst_note: worstNote ? { title: worstNote.title, views: worstNote.views, likes: worstNote.likes, comments: worstNote.comments, collects: worstNote.collects } : null
        };

        // 4. 调用 AI 生成复盘报告
        const provider = AIFactory.getTextProvider();

        const systemPrompt = `你是一名专业的小红书内容运营分析师，擅长数据复盘和运营策略优化。

【分析维度】
1. **整体趋势**：对比各维度数据的变化趋势（阅读、点赞、评论、收藏）
2. **亮点提炼**：找出数据增长明显、表现优异的方面
3. **问题诊断**：发现数据下滑、互动不足等潜在问题
4. **优化建议**：针对发现的问题给出具体可执行的改进方案
5. **笔记分析**：对表现最好和最差的笔记进行归因分析

【输出要求】
请严格按以下 JSON 格式返回分析结果（不要包含多余内容）：
{
  "summary": "一句话核心总结",
  "highlights": ["亮点描述1", "亮点描述2", ...],
  "concerns": ["问题描述1", "问题描述2", ...],
  "suggestions": ["建议1", "建议2", ...],
  "top_note_analysis": { "title": "笔记标题", "reason": "表现好的原因分析" },
  "worst_note_analysis": { "title": "笔记标题", "reason": "表现差的原因分析" }
}`;

        const userPrompt = `请对以下小红书账号的${dataContext.period}数据进行复盘分析：

【账号概况】
- 账号名：${dataContext.account_name}
- 总笔记数：${dataContext.total_notes}
- 总阅读量：${dataContext.total_views}
- 总点赞数：${dataContext.total_likes}
- 总评论数：${dataContext.total_comments}
- 总收藏数：${dataContext.total_collects}

【每日数据趋势】
${JSON.stringify(recentHistory.slice(0, 10), null, 2)}
${recentHistory.length > 10 ? `...(共${recentHistory.length}天数据)` : ''}

【表现最好的笔记】
${dataContext.top_note ? `${dataContext.top_note.title} - 阅读:${dataContext.top_note.views}, 点赞:${dataContext.top_note.likes}, 评论:${dataContext.top_note.comments}, 收藏:${dataContext.top_note.collects}` : '暂无数据'}

【表现最差的笔记】
${dataContext.worst_note ? `${dataContext.worst_note.title} - 阅读:${dataContext.worst_note.views}, 点赞:${dataContext.worst_note.likes}, 评论:${dataContext.worst_note.comments}, 收藏:${dataContext.worst_note.collects}` : '暂无数据'}`;

        try {
            const aiResponse = await provider.generateText([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);

            // 5. 解析 AI 返回的 JSON
            const result = this.parseReviewResponse(aiResponse);

            Logger.info('AIReviewService', 'Review generation completed', { summary: result.summary });
            return result;
        } catch (error: any) {
            Logger.error('AIReviewService', 'Review generation failed', error);
            throw new Error(`复盘分析失败: ${error.message}`);
        }
    }

    /**
     * 解析 AI 返回的复盘 JSON 响应
     *
     * 参数说明：
     * - response: [string] AI 返回的原始文本
     *
     * 返回说明：
     * - ReviewResult 解析后的复盘结果
     *
     * NOTE: 处理 AI 可能包裹 markdown 代码块的情况
     */
    private static parseReviewResponse(response: string): ReviewResult {
        // 清理可能的 markdown 代码块包裹
        let jsonStr = response.trim();
        if (jsonStr.startsWith('```')) {
            // 移除开头的 ```json 或 ```
            const firstNewline = jsonStr.indexOf('\n');
            jsonStr = jsonStr.substring(firstNewline + 1);
            // 移除结尾的 ```
            const lastBacktick = jsonStr.lastIndexOf('```');
            if (lastBacktick !== -1) {
                jsonStr = jsonStr.substring(0, lastBacktick);
            }
        }

        const parsed = JSON.parse(jsonStr.trim());

        return {
            summary: parsed.summary || '暂无总结',
            highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
            concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
            top_note_analysis: {
                title: parsed.top_note_analysis?.title || '无',
                reason: parsed.top_note_analysis?.reason || '无分析'
            },
            worst_note_analysis: {
                title: parsed.worst_note_analysis?.title || '无',
                reason: parsed.worst_note_analysis?.reason || '无分析'
            }
        };
    }

    /**
     * 获取表现最好的笔记（按点赞数降序取第一条）
     *
     * 返回说明：
     * - 笔记记录 | undefined
     */
    private static getTopNote(): any {
        try {
            const row = db.prepare(`
                SELECT title, views, likes, comments, collects
                FROM note_stats
                WHERE title IS NOT NULL AND title != ''
                ORDER BY likes DESC
                LIMIT 1
            `).get();
            return row;
        } catch {
            return undefined;
        }
    }

    /**
     * 获取表现最差的笔记（有阅读但点赞数最少取第一条）
     *
     * 返回说明：
     * - 笔记记录 | undefined
     */
    private static getWorstNote(): any {
        try {
            const row = db.prepare(`
                SELECT title, views, likes, comments, collects
                FROM note_stats
                WHERE title IS NOT NULL AND title != '' AND views > 0
                ORDER BY likes ASC
                LIMIT 1
            `).get();
            return row;
        } catch {
            return undefined;
        }
    }

    /**
     * 返回模拟的复盘数据，用于 Demo 模式演示
     *
     * 参数说明：
     * - period: [string] 复盘周期
     *
     * 返回说明：
     * - ReviewResult 包含预设的分析结果
     */
    private static getMockReview(period: 'week' | 'month'): ReviewResult {
        const label = period === 'week' ? '本周' : '本月';
        return {
            summary: `${label}账号整体表现稳定，阅读量和互动数据有小幅增长，内容方向基本符合受众偏好`,
            highlights: [
                `${label}总阅读量较上期增长15%，多条笔记进入流量推荐池`,
                `穿搭类内容持续高互动，收藏率超过行业平均水平`,
                `新尝试的视频笔记形式获得了意外的好评反馈`
            ],
            concerns: [
                `下午时段发布的笔记曝光量明显低于其他时段`,
                `评论互动率略微下降，需要关注评论区运营质量`,
                `部分笔记封面图点击率偏低，封面吸引力有待提升`
            ],
            suggestions: [
                `将发布时间集中在上午9-11点和晚上7-9点两个流量高峰时段`,
                `增加评论区互动引导话术，如在正文结尾设置讨论话题`,
                `使用对比强烈的封面配色方案，配合数字、悬念型标题`,
                `每周至少发布1-2条视频笔记，丰富内容形式`
            ],
            top_note_analysis: {
                title: '碎花裙+针织开衫温柔春日穿搭',
                reason: '标题使用了"温柔感""春日"等热门关键词，封面图色彩柔和有质感，正文结构清晰，穿搭单品信息完整，引发大量收藏和模仿'
            },
            worst_note_analysis: {
                title: '某护肤品使用心得分享',
                reason: '标题缺乏吸引力，无具体卖点或数字钩子，封面图背景杂乱，正文信息密度低，缺少与竞品的对比分析'
            }
        };
    }
}
