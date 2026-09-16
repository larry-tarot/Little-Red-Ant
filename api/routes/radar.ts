import { Router } from 'express';
import { DemandRadarService } from '../services/core/DemandRadarService.js';

const router = Router();

// --- 监控项管理 (Keyword Watches) ---

// 添加关键词监控项
router.post('/watches', (req, res) => {
    try {
        const { accountId, keyword, category, targetAudience, minLikesThreshold } = req.body;
        if (!accountId || !keyword) {
            return res.status(400).json({ error: '缺少必要参数: accountId, keyword' });
        }

        const watch = DemandRadarService.addKeywordWatch({
            accountId: Number(accountId),
            keyword,
            category,
            targetAudience,
            minLikesThreshold: minLikesThreshold !== undefined ? Number(minLikesThreshold) : undefined
        });

        res.status(201).json({ success: true, watch });
    } catch (error: any) {
        res.status(500).json({ error: `添加关键词监控失败: ${error.message}` });
    }
});

// 查询账号关联的监控列表
router.get('/watches', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }

        const list = DemandRadarService.listWatches(accountId);
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: `查询监控列表失败: ${error.message}` });
    }
});

// 删除监控项
router.delete('/watches/:id', (req, res) => {
    try {
        const success = DemandRadarService.deleteWatch(req.params.id);
        res.json({ success });
    } catch (error: any) {
        res.status(500).json({ error: `删除监控项失败: ${error.message}` });
    }
});

// --- 雷达合成与采纳 (Synthesis & Adoption) ---

// 合成机会卡候选 (Synthesize)
router.post('/synthesize', (req, res) => {
    try {
        const { accountId, keyword, signals, targetAudience, scenario } = req.body;
        if (!accountId || !keyword || !signals || !Array.isArray(signals)) {
            return res.status(400).json({ error: '缺少合成候选的必要参数: accountId, keyword, signals' });
        }

        const candidate = DemandRadarService.synthesizeCandidate({
            accountId: Number(accountId),
            keyword,
            signals,
            targetAudience,
            scenario
        });

        res.json({ success: true, candidate });
    } catch (error: any) {
        res.status(500).json({ error: `合成机会候选失败: ${error.message}` });
    }
});

// 采纳候选为正式 P1.2 机会卡 (Adopt)
router.post('/adopt', (req, res) => {
    try {
        const { candidate } = req.body;
        if (!candidate || !candidate.title || !candidate.signals) {
            return res.status(400).json({ error: '缺少待采纳的候选对象 candidate' });
        }

        const opportunity = DemandRadarService.adoptCandidateToOpportunity(candidate);
        res.status(201).json({ success: true, opportunity });
    } catch (error: any) {
        res.status(500).json({ error: `采纳机会卡失败: ${error.message}` });
    }
});

export default router;
