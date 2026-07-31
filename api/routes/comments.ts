import { Router } from 'express';
import { replyToComment } from '../services/rpa/comments.js';
import { enqueueTask } from '../services/queue.js';
import { CommentService } from '../services/core/CommentService.js';
import { CommentAnalysisService } from '../services/ai/CommentAnalysisService.js';
import { validateQuery, validateBody, validateParams } from '../middleware/validation.js';
import {
    CommentListQuerySchema,
    CommentReplyBodySchema,
    IdParamSchema,
} from '../schemas/index.js';

const router = Router();

// Get Comments from DB
router.get('/', validateQuery(CommentListQuerySchema), (req, res) => {
    try {
        const { status, page = 1, pageSize = 20, accountId } = req.query as any;

        const result = CommentService.listComments({
            status: status as string | undefined,
            page: Number(page),
            pageSize: Number(pageSize),
            accountId: accountId as string | undefined
        });

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination,
            activeAccountId: result.activeAccountId
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger Scrape (Async)
router.post('/scrape', async (_req, res) => {
    try {
        const taskId = enqueueTask('SCRAPE_COMMENTS', {});
        res.json({ taskId, status: 'PENDING', message: 'Scrape task queued' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get AI-suggested reply for a comment
router.get('/:id/suggestion', validateParams(IdParamSchema), async (req, res) => {
    try {
        const comment = CommentService.getCommentById(req.params.id);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });

        // Use existing AI analysis if available, otherwise generate on the fly
        if (comment.ai_reply_suggestion) {
            return res.json({ suggestion: comment.ai_reply_suggestion, intent: comment.intent });
        }

        const analysis = await CommentAnalysisService.analyzeComment(comment.content || '');
        // Save the analysis for future use
        CommentService.updateCommentAnalysis(comment.id, analysis.intent, analysis.suggestion);
        res.json({ suggestion: analysis.suggestion, intent: analysis.intent });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Reply to Comment
router.post('/reply', validateBody(CommentReplyBodySchema), async (req, res) => {
    const { commentId, content } = req.body;
    if (!commentId || !content) return res.status(400).json({ error: 'Missing params' });

    try {
        const result = await replyToComment(commentId, content);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
