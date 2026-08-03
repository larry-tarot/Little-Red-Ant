/**
 * 文件功能：笔记诊断服务，对单篇笔记进行多维度健康度分析
 * 主要类/函数：NoteDiagnosisService
 * 作者：AI Assistant
 * 创建时间：2026-07-31
 */

import { AIFactory } from './AIFactory.js';
import { Logger } from '../LoggerService.js';
import { DemoService } from '../DemoService.js';
import db from '../../db.js';

/**
 * 笔记诊断结果接口
 * 包含健康度评分、各维度分析及改进建议
 */
export interface DiagnosisResult {
    /** 综合健康评分 0-100 */
    score: number;
    /** 标题分析 */
    title_analysis: {
        /** 标题质量评分 0-10 */
        score: number;
        /** 标题存在的问题 */
        issues: string[];
        /** 标题优化建议 */
        tips: string[];
    };
    /** 发布时间分析 */
    timing_analysis: {
        /** 发布时间是否在最佳时段 */
        is_optimal: boolean;
        /** 发布时间建议 */
        suggestion: string;
    };
    /** 标签分析 */
    tag_analysis: {
        /** 缺少的关键词 */
        missing_keywords: string[];
        /** 推荐使用的标签 */
        suggestion: string[];
    };
    /** 可执行的优化建议列表 */
    action_suggestions: string[];
}

/**
 * 笔记诊断服务
 *
 * 功能说明：
 * - 对单篇笔记进行多维度诊断分析
 * - 评估标题质量、发布时间、标签策略
 * - 给出具体的可执行优化建议
 *
 * 使用示例：
 * ```typescript
 * const diagnosis = await NoteDiagnosisService.diagnose(1);
 * console.log(`健康度评分: ${diagnosis.score}`);
 * console.log(`建议: ${diagnosis.action_suggestions.join(', ')}`);
 * ```
 */
export class NoteDiagnosisService {

    /**
     * 对指定笔记执行诊断分析
     *
     * 参数说明：
     * - noteId: [number] 笔记 ID
     *
     * 返回说明：
     * - DiagnosisResult 包含 score、title_analysis、timing_analysis、tag_analysis、action_suggestions
     *
     * 异常情况：
     * - Demo 模式下返回模拟数据
     * - 笔记不存在时抛出异常
     * - AI 调用失败时抛出异常
     *
     * 使用示例：
     * >>> const result = await NoteDiagnosisService.diagnose(42);
     * >>> if (result.score < 60) console.log('需要重点关注');
     */
    static async diagnose(noteId: number): Promise<DiagnosisResult> {
        // Demo 模式：无 API Key 时返回模拟数据
        const isDemo = await DemoService.isDemoMode();
        if (isDemo) {
            Logger.info('NoteDiagnosisService', 'Demo mode: returning mock diagnosis');
            return this.getMockDiagnosis();
        }

        Logger.info('NoteDiagnosisService', `Diagnosing note ID: ${noteId}`);

        // 1. 从数据库获取笔记数据
        const note = db.prepare(`
            SELECT
                title, cover_image, views, likes, comments,
                collects, shares, publish_date, draft_id
            FROM note_stats
            WHERE id = ?
        `).get(noteId) as any;

        if (!note) {
            throw new Error(`笔记 ID ${noteId} 不存在`);
        }

        // 2. 获取草稿关联信息（标签等）
        let tags: string = '';
        if (note.draft_id) {
            const draft = db.prepare('SELECT tags, content_type FROM drafts WHERE id = ?')
                .get(note.draft_id) as any;
            if (draft) {
                tags = draft.tags || '';
            }
        }

        // 3. 构建 AI 上下文
        const provider = AIFactory.getTextProvider();

        const systemPrompt = `你是一名专业的小红书内容诊断分析师，擅长对单篇笔记进行多维度健康度评估。

【分析维度】
1. **标题分析**：评估标题的吸引力、关键词覆盖度、情绪感染力、长度合理性
2. **发布时间分析**：判断发布时间是否在小红书流量高峰时段（上午9-11点、中午12-14点、晚上19-22点），若非最佳时段给出调整建议
3. **标签分析**：评估当前标签的精准度、热度、覆盖率，指出缺少的关键词并推荐更优标签
4. **综合建议**：结合数据表现给出3-5条可执行的优化方案

【输出要求】
请严格按以下 JSON 格式返回诊断结果（不要包含多余内容）：
{
  "score": 数字(0-100，综合健康评分),
  "title_analysis": {
    "score": 数字(0-10，标题质量评分),
    "issues": ["问题1", "问题2", ...],
    "tips": ["优化建议1", "优化建议2", ...]
  },
  "timing_analysis": {
    "is_optimal": true/false,
    "suggestion": "发布时间建议（一句话）"
  },
  "tag_analysis": {
    "missing_keywords": ["缺少的关键词1", ...],
    "suggestion": ["推荐标签1", "推荐标签2", ...]
  },
  "action_suggestions": ["可执行建议1", "建议2", ...]
}`;

        const userPrompt = `请诊断以下小红书笔记：

【基本信息】
- 标题：${note.title || '未设置'}
- 标签：${tags || '未设置'}
- 发布时间：${note.publish_date || '未知'}

【数据表现】
- 阅读量：${note.views || 0}
- 点赞数：${note.likes || 0}
- 评论数：${note.comments || 0}
- 收藏数：${note.collects || 0}
- 分享数：${note.shares || 0}

请根据以上信息进行综合诊断分析。`;

        try {
            const aiResponse = await provider.generateText([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);

            // 4. 解析 AI 返回的 JSON
            const result = this.parseDiagnosisResponse(aiResponse, noteId);

            Logger.info('NoteDiagnosisService', `Diagnosis completed for note ${noteId}`, { score: result.score });
            return result;
        } catch (error: any) {
            Logger.error('NoteDiagnosisService', `Diagnosis failed for note ${noteId}`, error);
            throw new Error(`笔记诊断失败: ${error.message}`);
        }
    }

    /**
     * 解析 AI 返回的诊断 JSON 响应
     *
     * 参数说明：
     * - response: [string] AI 返回的原始文本
     * - noteId: [number] 笔记 ID（用于日志）
     *
     * 返回说明：
     * - DiagnosisResult 解析后的诊断结果
     *
     * NOTE: 处理 AI 可能包裹 markdown 代码块的情况
     */
    private static parseDiagnosisResponse(response: string, _noteId: number): DiagnosisResult {
        // 清理可能的 markdown 代码块包裹
        let jsonStr = response.trim();
        if (jsonStr.startsWith('```')) {
            const firstNewline = jsonStr.indexOf('\n');
            jsonStr = jsonStr.substring(firstNewline + 1);
            const lastBacktick = jsonStr.lastIndexOf('```');
            if (lastBacktick !== -1) {
                jsonStr = jsonStr.substring(0, lastBacktick);
            }
        }

        const parsed = JSON.parse(jsonStr.trim());

        // 数据校验与安全兜底
        const score = Math.max(0, Math.min(100, Math.round(parsed.score || 50)));
        const titleScore = Math.max(0, Math.min(10, parsed.title_analysis?.score || 5));

        return {
            score,
            title_analysis: {
                score: titleScore,
                issues: Array.isArray(parsed.title_analysis?.issues) ? parsed.title_analysis.issues : [],
                tips: Array.isArray(parsed.title_analysis?.tips) ? parsed.title_analysis.tips : []
            },
            timing_analysis: {
                is_optimal: !!parsed.timing_analysis?.is_optimal,
                suggestion: parsed.timing_analysis?.suggestion || '暂无发布时段建议'
            },
            tag_analysis: {
                missing_keywords: Array.isArray(parsed.tag_analysis?.missing_keywords) ? parsed.tag_analysis.missing_keywords : [],
                suggestion: Array.isArray(parsed.tag_analysis?.suggestion) ? parsed.tag_analysis.suggestion : []
            },
            action_suggestions: Array.isArray(parsed.action_suggestions) ? parsed.action_suggestions : []
        };
    }

    /**
     * 返回模拟的诊断数据，用于 Demo 模式演示
     *
     * 返回说明：
     * - DiagnosisResult 包含预设的分析结果
     */
    private static getMockDiagnosis(): DiagnosisResult {
        return {
            score: 72,
            title_analysis: {
                score: 7,
                issues: [
                    '标题缺乏数字钩子，开头吸引力不足',
                    '未包含垂类热门搜索关键词'
                ],
                tips: [
                    '在标题开头加入数字（如"3个方法""5分钟"）增强吸引力',
                    '加入"干货""避坑""保姆级"等平台热门标签词',
                    '使用问句或感叹号增加互动感'
                ]
            },
            timing_analysis: {
                is_optimal: false,
                suggestion: '当前发布时间在下午3点，建议调整至晚上19-21点发布，该时段为小红书流量高峰，曝光量可提升30%以上'
            },
            tag_analysis: {
                missing_keywords: ['穿搭教程', '春日穿搭', '约会穿搭'],
                suggestion: ['#穿搭', '#春日穿搭', '#约会穿搭', '#温柔风', '#日常穿搭', '#显瘦穿搭']
            },
            action_suggestions: [
                '优化标题，在开头加入数字钩子',
                '将发布时间调整至晚间流量高峰时段',
                '补充3-5个长尾标签增加搜索曝光',
                '在正文末尾增加互动引导（如"你们喜欢哪一套"）',
                '关注评论区高频问题，作为下一篇选题参考'
            ]
        };
    }
}
