import { Router } from 'express';
import { NoteReviewService } from '../services/core/NoteReviewService.js';
import { NoteFeedbackSyncService } from '../services/core/NoteFeedbackSyncService.js';

const router = Router();

// 创建笔记复盘
router.post('/', (req, res) => {
    try {
        const {
            accountId, noteId, title, publishedAt,
            views, likes, collects, comments,
            ctrAssessment, interactionAssessment,
            whatWorked, whatFailed, feedbackSignals, nextActionIdeas
        } = req.body;

        if (!accountId || !title) {
            return res.status(400).json({ error: '缺少必要参数: accountId, title' });
        }

        const review = NoteReviewService.createReview({
            accountId: Number(accountId),
            noteId,
            title,
            publishedAt,
            views: views !== undefined ? Number(views) : undefined,
            likes: likes !== undefined ? Number(likes) : undefined,
            collects: collects !== undefined ? Number(collects) : undefined,
            comments: comments !== undefined ? Number(comments) : undefined,
            ctrAssessment,
            interactionAssessment,
            whatWorked,
            whatFailed,
            feedbackSignals,
            nextActionIdeas
        });

        res.status(201).json({ success: true, review });
    } catch (error: any) {
        res.status(500).json({ error: `创建复盘失败: ${error.message}` });
    }
});

// 查询账号的所有笔记复盘
router.get('/', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }

        const list = NoteReviewService.listReviews(accountId);
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: `查询复盘列表失败: ${error.message}` });
    }
});

// 拉取账号已发布的笔记列表及最新指标（复盘预填候选池）
router.get('/syncable-notes', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }

        const notes = NoteFeedbackSyncService.getSyncableNotes(accountId);
        res.json({ success: true, notes });
    } catch (error: any) {
        res.status(500).json({ error: `拉取笔记列表失败: ${error.message}` });
    }
});

// 提取指定笔记的评论区求助与反馈信号
router.get('/extract-feedback', (req, res) => {
    try {
        const noteId = req.query.noteId as string;
        if (!noteId) {
            return res.status(400).json({ error: '必须提供 noteId 参数' });
        }

        const feedback = NoteFeedbackSyncService.extractNoteFeedbackSignals(noteId);
        res.json({ success: true, feedback });
    } catch (error: any) {
        res.status(500).json({ error: `提取评论反馈失败: ${error.message}` });
    }
});

// 从已同步笔记一键自动生成预填复盘记录
router.post('/auto-create', (req, res) => {
    try {
        const { accountId, noteId } = req.body;
        if (!accountId || !noteId) {
            return res.status(400).json({ error: '缺少必要参数: accountId, noteId' });
        }

        const review = NoteFeedbackSyncService.autoCreateReviewFromNote(Number(accountId), noteId);
        res.status(201).json({ success: true, review });
    } catch (error: any) {
        res.status(500).json({ error: `自动生成复盘失败: ${error.message}` });
    }
});

// 查询单个复盘详情
router.get('/:id', (req, res) => {
    try {
        const review = NoteReviewService.getReview(req.params.id);
        if (!review) return res.status(404).json({ error: '复盘记录未找到' });
        res.json(review);
    } catch (error: any) {
        res.status(500).json({ error: `获取复盘详情失败: ${error.message}` });
    }
});

// 一键反哺生成 P1.2 内容机会卡 (Derive Opportunity)
router.post('/:id/derive-opportunity', (req, res) => {
    try {
        const { ideaIndex, customTitle, targetAudience, scenario } = req.body || {};
        const opportunity = NoteReviewService.deriveOpportunityFromReview(req.params.id, {
            ideaIndex: ideaIndex !== undefined ? Number(ideaIndex) : 0,
            customTitle,
            targetAudience,
            scenario
        });

        res.status(201).json({ success: true, opportunity });
    } catch (error: any) {
        res.status(500).json({ error: `反哺生成机会卡失败: ${error.message}` });
    }
});

export default router;
