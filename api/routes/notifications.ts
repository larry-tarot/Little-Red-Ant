import express from 'express';
import { NotificationService } from '../services/NotificationService.js';
import { validateQuery, validateParams } from '../middleware/validation.js';
import { NotificationListQuerySchema, NotificationIdParamSchema } from '../schemas/index.js';

const router = express.Router();

// Get list
router.get('/', validateQuery(NotificationListQuerySchema), (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query as any;
        const notifications = NotificationService.getNotifications(limit, offset);
        res.json(notifications);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get unread count
router.get('/unread-count', (_req, res) => {
    try {
        const count = NotificationService.getUnreadCount();
        res.json({ count });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Mark as read
router.put('/:id/read', validateParams(NotificationIdParamSchema), (req, res) => {
    try {
        NotificationService.markAsRead(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Mark all as read
router.put('/read-all', (_req, res) => {
    try {
        NotificationService.markAllAsRead();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
