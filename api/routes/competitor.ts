import { Router } from 'express';
import { enqueueTask } from '../services/queue.js';
import { DataSanitizer } from '../utils/DataSanitizer.js';
import { wrapError } from '../utils/ErrorMessages.js';
import { CompetitorService } from '../services/core/CompetitorService.js';

const router = Router();

// Get List
router.get('/', (req, res) => {
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
router.get('/:id', (req, res) => {
    try {
        const data = CompetitorService.getCompetitorDetail(req.params.id);
        if (!data) return res.status(404).json({ error: 'Competitor not found' });

        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add/Analyze (Async)
router.post('/analyze', async (req, res) => {
    const { url: urlFromBody } = req.body;
    if (!urlFromBody) return res.status(400).json({ error: 'URL or User ID required' });

    try {
        // 从 URL 中提取用户 ID
        const userId = DataSanitizer.extractUserId(urlFromBody);

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
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', (req, res) => {
    try {
        CompetitorService.deleteCompetitor(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
