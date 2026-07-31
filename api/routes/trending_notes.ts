import { Router } from 'express';
import { enqueueTask } from '../services/queue.js';
import { AssetService } from '../services/asset/AssetService.js';
import { TrendService } from '../services/core/TrendService.js';
import { validateQuery, validateBody, validateParams } from '../middleware/validation.js';
import {
    TrendingNotesListQuerySchema,
    TrendingNoteImportSchema,
    TrendingNoteScrapeSchema,
    IdParamSchema,
    TrendingNoteBatchDeleteSchema,
} from '../schemas/index.js';

const router = Router();

/**
 * 功能描述：将笔记封面图片本地化（外部 URL 下载到本地）
 *
 * 参数说明：
 * - note: [any] 笔记对象，需包含 id 和 cover_url 字段
 *
 * 返回说明：
 * - any 处理后的笔记对象（cover_url 可能被更新为本地路径）
 *
 * NOTE: 此函数为异步"触发即忘"调用，失败仅记录日志不阻断主流程
 */
const localizeCover = async (note: any) => {
    if (!note.cover_url) return note;

    // 仅对外部 http 链接做本地化（本地路径和 /uploads/ 跳过）
    if (note.cover_url.startsWith('http') && !note.cover_url.includes('localhost') && !note.cover_url.includes('/uploads/')) {
        try {
            const localUrl = await AssetService.downloadAndLocalize(note.cover_url, 'image');
            // 本地化成功后更新数据库记录
            TrendService.updateCoverUrl(note.id, localUrl);
            note.cover_url = localUrl;
        } catch (e) {
            console.warn(`Failed to localize cover for note ${note.id}:`, e);
        }
    }
    return note;
};

/**
 * 功能描述：解析笔记的 tags 和 analysis_result 字段（JSON 字符串转对象）
 *
 * 参数说明：
 * - note: [any] 原始笔记对象
 *
 * 返回说明：
 * - any 转换后的笔记对象，tags 和 analysis_result 为数组/对象或空值
 *
 * 异常情况：
 * - JSON 解析失败时抛出异常，由调用方捕获处理
 */
const parseNoteFields = (note: any) => {
    return {
        ...note,
        tags: note.tags ? JSON.parse(note.tags) : [],
        analysis_result: note.analysis_result ? JSON.parse(note.analysis_result) : null
    };
};

// Get list of trending notes
router.get('/', validateQuery(TrendingNotesListQuerySchema), async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            sort = 'scraped_at',
            category,
            search,
            date,
            analyzed = false,
            type
        } = req.query as any;

        // 调用 Service 层获取分页数据
        const result = TrendService.listTrendingNotes({
            page,
            limit,
            sort,
            category,
            search,
            date,
            analyzed,
            type
        });

        // 异步本地化封面图片（触发即忘，不阻塞响应）
        Promise.all(result.data.map(n => localizeCover(n))).catch(e =>
            console.error('Background localization failed', e)
        );

        // 解析 JSON 字段后返回
        res.json({
            data: result.data.map(parseNoteFields),
            pagination: result.pagination
        });
    } catch (error: any) {
        console.error('Error fetching trending notes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Import note from competitor to trending (for analysis)
router.post('/import', validateBody(TrendingNoteImportSchema), (req, res) => {
    try {
        const { note_id, title, cover_url, author_name, likes_count, note_url, type, video_url } = req.body;

        const result = TrendService.importNote({
            note_id,
            title,
            cover_url,
            author_name,
            likes_count,
            note_url,
            type,
            video_url
        });

        res.json(result);
    } catch (error: any) {
        console.error('Import note failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Trigger scrape for trending notes
router.post('/scrape', validateBody(TrendingNoteScrapeSchema), async (req, res) => {
    try {
        const { category } = req.body;
        const taskId = enqueueTask('SCRAPE_TRENDS', {
            source: 'xiaohongshu',
            type: 'notes',
            category: category || 'recommend'
        });
        res.json({ message: 'Scraping task started', taskId });
    } catch (error: any) {
        console.error('Error starting scrape:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single note details
router.get('/:id', validateParams(IdParamSchema), (req, res) => {
    try {
        const note = TrendService.getTrendingNoteById(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        try {
            res.json(parseNoteFields(note));
        } catch (e) {
            console.error(`[TrendingNotes] Failed to parse note id=${req.params.id}:`, e);
            res.status(500).json({ error: '数据解析失败，笔记内容可能损坏' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger analysis for a note
router.post('/:id/analyze', validateParams(IdParamSchema), async (req, res) => {
    try {
        const noteId = req.params.id;

        // 兼容前端传入 DB ID 或 note_id 两种情况
        let targetNoteId = noteId;
        if (/^\d+$/.test(noteId)) {
            // 看起来是 DB ID，查找对应的 note_id
            const note = TrendService.getNoteIdByDbId(noteId);
            if (note) targetNoteId = note.note_id;
        }

        // 检查是否已有分析结果，有则直接返回
        const existing = TrendService.getAnalysisResult(targetNoteId);
        if (existing && existing.analysis_result) {
            try {
                return res.json({
                    status: 'COMPLETED',
                    result: JSON.parse(existing.analysis_result)
                });
            } catch (e) {
                console.error(`[TrendingNotes] Failed to parse analysis_result for ${targetNoteId}:`, e);
            }
        }

        // 入队分析任务
        const taskId = enqueueTask('ANALYZE_NOTE', { noteId: targetNoteId });
        res.json({ message: 'Analysis started', taskId, status: 'PENDING' });
    } catch (error: any) {
        console.error('Error starting analysis:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete note
router.delete('/:id', validateParams(IdParamSchema), (req, res) => {
    try {
        TrendService.deleteTrendingNote(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Batch delete notes
router.post('/batch-delete', validateBody(TrendingNoteBatchDeleteSchema), (req, res) => {
    try {
        const { ids } = req.body;
        const count = TrendService.batchDeleteTrendingNotes(ids);
        res.json({ success: true, count });
    } catch (error: any) {
        console.error('Batch delete failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Refresh note (Force re-scrape)
router.post('/:id/refresh', validateParams(IdParamSchema), async (req, res) => {
    try {
        const note = TrendService.getNoteIdByDbId(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        // 清空 content 强制重新抓取深度内容
        TrendService.clearNoteContentForRefresh(req.params.id);

        const taskId = enqueueTask('ANALYZE_NOTE', { noteId: note.note_id });
        res.json({ success: true, taskId, message: 'Refresh started' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
