import { Router } from 'express';
import { OptimizationService } from '../services/core/OptimizationService.js';

const router = Router();

// Get all optimizations
router.get('/', (req, res) => {
    try {
        const status = req.query.status as string;
        const data = OptimizationService.listOptimizations(status);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Apply Optimization
router.post('/:id/apply', (req, res) => {
    try {
        const result = OptimizationService.applyOptimization(req.params.id);
        if (!result.success) {
            // 根据错误类型返回对应状态码
            const statusCode = result.error === 'Optimization not found' ? 404 : 400;
            return res.status(statusCode).json({ success: false, error: result.error });
        }
        res.json({ success: true, message: 'Optimization applied successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reject Optimization
router.post('/:id/reject', (req, res) => {
    try {
        OptimizationService.rejectOptimization(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
