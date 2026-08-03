import { Router } from 'express';
import { enqueueTask } from '../services/queue.js';
import { DataSanitizer } from '../utils/DataSanitizer.js';
import { wrapError } from '../utils/ErrorMessages.js';
import { CompetitorService } from '../services/core/CompetitorService.js';
import { CompetitorNoteAnalyzer } from '../services/ai/CompetitorNoteAnalyzer.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import { CompetitorAnalyzeSchema, IdParamSchema } from '../schemas/index.js';
import db from '../db.js';

const router = Router();

/**
 * 统一错误响应格式
 */
function errorResponse(res: any, status: number, message: string, originalError?: any) {
    return res.status(status).json({
        success: false,
        error: message,
        friendlyError: originalError ? wrapError(originalError) : undefined
    });
}

// Get List
router.get('/', (_req, res) => {
    try {
        const data = CompetitorService.listCompetitors();
        res.json({ success: true, data });
    } catch (error: any) {
        const wrapped = wrapError(error);
        res.status(500).json({
            error: error.message,
            friendlyError: wrapped
        });
    }
});

// Get Details (Notes & History)
router.get('/:id', validateParams(IdParamSchema), (req, res) => {
    try {
        const data = CompetitorService.getCompetitorDetail(req.params.id);
        if (!data) return errorResponse(res, 404, 'Competitor not found');

        res.json({ success: true, data });
    } catch (error: any) {
        console.error('Get competitor detail failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error', error);
    }
});

// Add/Analyze (Async)
router.post('/analyze', validateBody(CompetitorAnalyzeSchema), async (req, res) => {
    const { url: urlFromBody } = req.body;

    try {
        // 从 URL 中提取用户 ID
        const userId = DataSanitizer.extractUserId(urlFromBody);
        if (!userId) {
            return errorResponse(res, 400, '无法从 URL 中提取小红书用户 ID');
        }

        // 添加或刷新竞品记录
        const { dbId, isExisting } = CompetitorService.addOrRefreshCompetitor(userId);

        // 入队抓取任务
        const taskId = enqueueTask('SCRAPE_COMPETITOR', { url: userId, id: dbId });

        res.json({
            success: true,
            taskId,
            id: dbId,
            status: isExisting ? 'refreshing' : 'pending',
            message: isExisting ? 'Refresh task queued' : 'New competitor added, scraping started'
        });
    } catch (error: any) {
        console.error('Add competitor failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error', error);
    }
});

/**
 * AI 拆解竞品笔记
 * 对指定笔记进行多维度 AI 分析（标题技巧、封面、结构、钩子等）
 */
router.post('/notes/:noteId/analyze', async (req, res) => {
    try {
        const { noteId } = req.params;

        // 从 competitor_notes 表查询笔记数据
        const note = db.prepare(`
            SELECT cn.*, c.nickname AS competitor_nickname
            FROM competitor_notes cn
            JOIN competitors c ON c.id = cn.competitor_id
            WHERE cn.note_id = ?
        `).get(noteId) as any;

        if (!note) {
            return errorResponse(res, 404, '竞品笔记未找到');
        }

        // 构建分析所需的笔记数据
        const noteData = {
            title: note.title,
            content: note.content || '',
            cover_description: note.cover || '',
            likes: note.likes,
            collects: note.collects,
            comments: note.comments,
            views: note.views,
            tags: note.tags
        };

        // 调用 AI 分析
        const analysis = await CompetitorNoteAnalyzer.analyzeNote(noteData);

        res.json({
            success: true,
            data: {
                note: {
                    id: note.id,
                    title: note.title,
                    cover: note.cover,
                    likes: note.likes,
                    collects: note.collects,
                    comments: note.comments
                },
                analysis
            }
        });
    } catch (error: any) {
        console.error('Note analysis failed:', error);
        errorResponse(res, 500, error.message || 'AI 分析失败', error);
    }
});

// Delete
router.delete('/:id', validateParams(IdParamSchema), (req, res) => {
    try {
        CompetitorService.deleteCompetitor(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete competitor failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error', error);
    }
});

export default router;
