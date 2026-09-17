import { Router } from 'express';
import { ContentSeriesService } from '../services/core/ContentSeriesService.js';

const router = Router();

// 创建系列专栏
router.post('/', (req, res) => {
    try {
        const { accountId, title, description, targetPillar, plannedCount } = req.body;
        if (!accountId || !title) {
            return res.status(400).json({ error: '缺少必要参数: accountId, title' });
        }

        const series = ContentSeriesService.createSeries({
            accountId: Number(accountId),
            title,
            description,
            targetPillar,
            plannedCount: plannedCount !== undefined ? Number(plannedCount) : undefined
        });

        res.status(201).json({ success: true, series });
    } catch (error: any) {
        res.status(500).json({ error: `创建系列失败: ${error.message}` });
    }
});

// 查询账号的所有系列专栏
router.get('/', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }

        const list = ContentSeriesService.listSeries(accountId);
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: `查询系列列表失败: ${error.message}` });
    }
});

// 栏目健康均衡度评估 (Pillar Balance Check)
router.get('/pillar-balance', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }

        const balance = ContentSeriesService.checkPillarBalance(accountId);
        res.json({ success: true, balance });
    } catch (error: any) {
        res.status(500).json({ error: `评估栏目健康度失败: ${error.message}` });
    }
});

// 跨账号协同矩阵总览 (Multi-Account Matrix Overview)
router.get('/matrix', (_req, res) => {
    try {
        const matrix = ContentSeriesService.getMultiAccountMatrix();
        res.json({ success: true, matrix });
    } catch (error: any) {
        res.status(500).json({ error: `获取矩阵数据失败: ${error.message}` });
    }
});

// 查询指定系列详情
router.get('/:id', (req, res) => {
    try {
        const series = ContentSeriesService.getSeries(req.params.id);
        if (!series) return res.status(404).json({ error: '系列不存在' });
        res.json(series);
    } catch (error: any) {
        res.status(500).json({ error: `获取系列详情失败: ${error.message}` });
    }
});

// 将内容包归入系列
router.post('/:id/attach-package', (req, res) => {
    try {
        const { packageId } = req.body;
        if (!packageId) {
            return res.status(400).json({ error: '缺少必要参数: packageId' });
        }

        ContentSeriesService.attachPackageToSeries(req.params.id, packageId);
        const updated = ContentSeriesService.getSeries(req.params.id);
        res.json({ success: true, series: updated });
    } catch (error: any) {
        res.status(500).json({ error: `加入系列失败: ${error.message}` });
    }
});

export default router;
