import { Router } from 'express';
import { enqueueTask } from '../services/queue.js';
import { NicheService } from '../services/core/NicheService.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import {
    NicheSearchSchema,
    NicheNotesQuerySchema,
    NicheClassifySchema,
    NicheExportQuerySchema,
} from '../schemas/index.js';

const router = Router();

/**
 * POST /api/niche/search
 * Create a search task for keyword-based note scraping
 *
 * Body:
 *   - keyword: string (required)
 *   - sort: "general" | "latest" | "popular" (optional, default "general")
 *   - limit: number (optional, default 20, max 50)
 *   - autoAnalyze: boolean (optional, default true)
 */
router.post('/search', validateBody(NicheSearchSchema), (req, res) => {
    try {
        const { keyword, sort = 'general', limit = 20, autoAnalyze = true } = req.body;

        if (!keyword || typeof keyword !== 'string') {
            return res.status(400).json({ error: 'keyword is required' });
        }

        const sanitizedKeyword = keyword.trim();
        if (sanitizedKeyword.length === 0 || sanitizedKeyword.length > 100) {
            return res.status(400).json({ error: 'keyword must be 1-100 characters' });
        }

        const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

        const taskId = enqueueTask('SCRAPE_SEARCH_NOTES', {
            keyword: sanitizedKeyword,
            sort,
            limit: sanitizedLimit,
            autoAnalyze
        });

        res.json({
            success: true,
            taskId,
            keyword: sanitizedKeyword,
            message: `Search task created for keyword: "${sanitizedKeyword}"`
        });
    } catch (error: any) {
        console.error('Niche search error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/niche/notes
 * Query search results with filtering and pagination
 */
router.get('/notes', validateQuery(NicheNotesQuerySchema), (req, res) => {
    try {
        const { keyword, sort = 'likes', page = 1, pageSize = 20, hasAnalysis = false, topic } = req.query as any;

        const result = NicheService.searchNotes({
            keyword,
            sort,
            page,
            pageSize,
            hasAnalysis,
            topic
        });

        res.json(result);
    } catch (error: any) {
        console.error('Niche notes query error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/niche/keywords
 * Get all distinct search keywords with result counts
 */
router.get('/keywords', (_req, res) => {
    try {
        const data = NicheService.getKeywords();
        res.json({ data });
    } catch (error: any) {
        console.error('Niche keywords query error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/niche/classify
 * Trigger AI classification for notes
 */
router.post('/classify', validateBody(NicheClassifySchema), (req, res) => {
    try {
        const { keyword, noteIds, categories } = req.body;

        const taskId = enqueueTask('CLASSIFY_NOTES', {
            keyword: keyword || undefined,
            noteIds: noteIds || undefined,
            categories: categories || undefined,
            batchSize: 10
        });

        res.json({
            success: true,
            taskId,
            message: 'Classification task created'
        });
    } catch (error: any) {
        console.error('Niche classify error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/niche/topics
 * Get all distinct topic tags for filtering
 */
router.get('/topics', (req, res) => {
    try {
        const keyword = req.query.keyword as string | undefined;
        const data = NicheService.getTopics(keyword);
        res.json({ data });
    } catch (error: any) {
        console.error('Niche topics query error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/niche/export
 * Export search results as Markdown or Excel
 */
router.get('/export', validateQuery(NicheExportQuerySchema), (req, res) => {
    try {
        const { keyword, topic, format = 'markdown' } = req.query as any;

        // 从 Service 获取原始数据（格式化逻辑留在路由层）
        const notes = NicheService.getExportNotes(keyword, topic);

        if (format === 'excel') {
            // 导出为 JSON（前端可转换为 Excel）
            const exportData = notes.map((n: any) => ({
                title: n.title || '',
                author: n.author_name || '',
                likes: n.likes_count || 0,
                collects: n.collects_count || 0,
                comments: n.comments_count || 0,
                url: n.note_url || '',
                content_summary: n.content ? n.content.substring(0, 500) : '',
                topics: n.topic_tags || '',
                analysis: n.analysis_result || ''
            }));

            res.setHeader('Content-Type', 'application/json');
            res.json({ format: 'excel', data: exportData, count: exportData.length });
        } else {
            // 导出为 Markdown（表现层格式化逻辑，保留在路由中）
            let md = `# 选题挖掘报告\n\n`;
            md += `> 生成时间: ${new Date().toLocaleString()}\n`;
            if (keyword) md += `> 关键词: ${keyword}\n`;
            if (topic) md += `> 子主题: ${topic}\n`;
            md += `> 共 ${notes.length} 条笔记\n\n`;
            md += `---\n\n`;

            for (let i = 0; i < notes.length; i++) {
                const n = notes[i];
                md += `## ${i + 1}. ${n.title || '无标题'}\n\n`;
                md += `- **作者**: ${n.author_name || '未知'}\n`;
                md += `- **点赞**: ${n.likes_count || 0} | **收藏**: ${n.collects_count || 0} | **评论**: ${n.comments_count || 0}\n`;
                md += `- **链接**: ${n.note_url || ''}\n`;

                if (n.topic_tags) {
                    try {
                        const tags = JSON.parse(n.topic_tags);
                        if (Array.isArray(tags) && tags.length > 0) {
                            md += `- **子主题**: ${tags.join(', ')}\n`;
                        }
                    } catch (_e) { /* ignore */ }
                }

                if (n.content) {
                    md += `\n**内容摘要**:\n\n${n.content.substring(0, 800)}${n.content.length > 800 ? '...' : ''}\n`;
                }

                if (n.analysis_result) {
                    try {
                        const analysis = JSON.parse(n.analysis_result);
                        md += `\n**结构拆解**:\n`;
                        if (analysis.hook_type) md += `- 钩子类型: ${analysis.hook_type}\n`;
                        if (analysis.hook_analysis) md += `- 钩子分析: ${analysis.hook_analysis}\n`;
                        if (analysis.structure_breakdown && Array.isArray(analysis.structure_breakdown)) {
                            md += `- 结构要点:\n`;
                            analysis.structure_breakdown.forEach((s: string, idx: number) => {
                                md += `  ${idx + 1}. ${s}\n`;
                            });
                        }
                        if (analysis.keywords) md += `- 关键词: ${analysis.keywords}\n`;
                    } catch (_e) { /* ignore */ }
                }

                md += `\n---\n\n`;
            }

            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="topic-mining-${keyword || 'all'}.md"`);
            res.send(md);
        }
    } catch (error: any) {
        console.error('Niche export error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
