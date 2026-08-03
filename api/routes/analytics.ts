import { Router } from 'express';
import * as XLSX from 'xlsx';
import { enqueueTask } from '../services/queue.js';
import { AnalyticsService } from '../services/core/AnalyticsService.js';
import { AIReviewService } from '../services/ai/AIReviewService.js';
import { GrowthInsightService } from '../services/ai/GrowthInsightService.js';
import { AnomalyDetector } from '../services/core/AnomalyDetector.js';
import { validateQuery } from '../middleware/validation.js';
import { PaginationQuerySchema } from '../schemas/index.js';

const router = Router();

function errorResponse(res: any, status: number, message: string) {
    return res.status(status).json({ success: false, error: message });
}

// Get Summary Stats
router.get('/summary', async (_req, res) => {
    try {
        const { DemoService } = await import('../services/DemoService.js');
        if (await DemoService.isDemoMode()) {
            return res.json(DemoService.getMockAnalytics());
        }
        const summary = AnalyticsService.getSummary();
        res.json(summary);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Note List with Pagination
router.get('/notes', validateQuery(PaginationQuerySchema), (req, res) => {
    try {
        const { page, pageSize } = req.query as any;
        const result = AnalyticsService.getNotes(page, pageSize);
        res.json(result);
    } catch (error: any) {
        console.error('Analytics notes fetch failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error');
    }
});

// Trigger Refresh (Async Scrape Task)
router.post('/refresh', async (_req, res) => {
    try {
        const taskId = enqueueTask('SCRAPE_STATS', {});
        res.json({ success: true, taskId, message: 'Scrape task queued' });
    } catch (error: any) {
        console.error('Refresh failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get History Trend
router.get('/history', async (_req, res) => {
    try {
        const { DemoService } = await import('../services/DemoService.js');
        if (await DemoService.isDemoMode()) {
            return res.json(DemoService.getMockHistory());
        }
        const history = AnalyticsService.getHistory();
        res.json(history);
    } catch (error: any) {
        console.error('History fetch failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Engagement Analysis (Comments & Intents)
router.get('/engagement', (_req, res) => {
    try {
        const engagement = AnalyticsService.getEngagement();
        res.json(engagement);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Export Data to Excel
router.get('/export', (_req, res) => {
    try {
        const exportData = AnalyticsService.getExportData();

        // 无活跃账号
        if (!exportData) {
            return res.status(404).json({ error: 'No active account found' });
        }

        // 无数据可导出
        if (exportData.notes.length === 0) {
            return res.status(400).json({ error: 'No data to export' });
        }

        // 创建 Excel 工作簿（表现层逻辑，保留在路由中）
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData.notes);

        // 设置列宽
        const colWidths = [
            { wch: 40 }, // Title
            { wch: 10 }, // Views
            { wch: 10 }, // Likes
            { wch: 10 }, // Collects
            { wch: 10 }, // Comments
            { wch: 20 }, // Publish Date
            { wch: 20 }  // Update Time
        ];
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, "Notes Data");

        // 生成 Buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // 设置响应头并返回文件
        res.setHeader('Content-Disposition', `attachment; filename="XiaoHongShu_Data_${encodeURIComponent(exportData.account.nickname)}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        res.send(buf);

    } catch (error: any) {
        console.error('Export failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// AI 复盘分析
router.post('/review', async (req, res) => {
    try {
        const { period } = req.body || {};
        const validPeriod = period === 'month' ? 'month' : 'week';
        const result = await AIReviewService.generateReview(validPeriod);
        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error('Review generation failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error');
    }
});

// 异常检测
router.get('/anomalies', (_req, res) => {
    try {
        const anomalies = AnomalyDetector.runCheck();
        res.json({ success: true, data: anomalies });
    } catch (error: any) {
        console.error('Anomaly detection failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error');
    }
});

// 多账号汇总看板 - 各账号数据总览
router.get('/all-summary', (_req, res) => {
    try {
        const summary = AnalyticsService.getSummaryAll();
        res.json({ success: true, data: summary });
    } catch (error: any) {
        console.error('All summary fetch failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error');
    }
});

// 多账号汇总看板 - 各账号历史趋势
router.get('/all-history', (_req, res) => {
    try {
        const history = AnalyticsService.getHistoryAll();
        res.json({ success: true, data: history });
    } catch (error: any) {
        console.error('All history fetch failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error');
    }
});

// 成长洞察分析
router.get('/growth-insight', async (_req, res) => {
    try {
        const insight = await GrowthInsightService.analyzeGrowth();
        res.json({ success: true, data: insight });
    } catch (error: any) {
        console.error('Growth insight analysis failed:', error);
        errorResponse(res, 500, error.message || 'Internal server error');
    }
});

export default router;
