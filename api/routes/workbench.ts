/**
 * 文件功能：今日工作台 API 路由
 * 路径前缀：/api/workbench
 * 作者：AI Assistant
 * 创建时间：2026-07-31
 */

import { Router } from 'express';
import { WorkbenchService } from '../services/core/WorkbenchService.js';

const router = Router();

/**
 * GET /api/workbench/today
 * 获取今日工作台聚合数据
 *
 * 返回：
 * - urgent_tasks: 按优先级排序的紧急事项列表
 * - summary: 昨日/本周数据概要
 * - calendar_preview: 内容日历预览
 * - suggestions: 运营建议
 */
router.get('/today', (_req, res) => {
    try {
        const data = WorkbenchService.getTodayWorkbench();
        res.json({ success: true, data });
    } catch (error: any) {
        console.error('[WorkbenchRoute] Failed to get today workbench:', error);
        res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
});

export default router;
