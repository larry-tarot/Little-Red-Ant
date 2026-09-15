import { Router } from 'express';
import { ResearchOpportunityService } from '../services/core/ResearchOpportunityService.js';

const router = Router();

// --- 证据管理 (Research Evidence) ---

// 录入单条研究证据
router.post('/evidence', (req, res) => {
    try {
        const { accountId, sourceType, sourceUrl, rawText, painPoints, desires, authorNickname } = req.body;
        if (!accountId || !sourceType || !rawText) {
            return res.status(400).json({ error: '缺少必要参数: accountId, sourceType, rawText' });
        }

        const evidence = ResearchOpportunityService.addEvidence({
            accountId: Number(accountId),
            sourceType,
            sourceUrl,
            rawText,
            painPoints,
            desires,
            authorNickname
        });

        res.status(201).json({ success: true, evidence });
    } catch (error: any) {
        res.status(500).json({ error: `录入证据失败: ${error.message}` });
    }
});

// 查询账号关联的证据列表
router.get('/evidence', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }

        const list = ResearchOpportunityService.listEvidence(accountId);
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: `查询证据失败: ${error.message}` });
    }
});

// --- 内容机会卡 (Content Opportunities) ---

// 创建机会卡
router.post('/opportunities', (req, res) => {
    try {
        const {
            accountId, title, targetAudience, scenario, problem,
            uniqueAngle, contentFormat, expectedOutcome, contentPillar, evidenceIds
        } = req.body;

        if (!accountId || !title || !targetAudience || !scenario || !problem || !uniqueAngle || !contentFormat || !expectedOutcome) {
            return res.status(400).json({ error: '缺少创建机会卡的必要字段' });
        }

        const opportunity = ResearchOpportunityService.createOpportunity({
            accountId: Number(accountId),
            title,
            targetAudience,
            scenario,
            problem,
            uniqueAngle,
            contentFormat,
            expectedOutcome,
            contentPillar,
            evidenceIds: evidenceIds || []
        });

        res.status(201).json({ success: true, opportunity });
    } catch (error: any) {
        res.status(500).json({ error: `创建内容机会卡失败: ${error.message}` });
    }
});

// 查询机会卡列表（支持 status 过滤）
router.get('/opportunities', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }
        const status = req.query.status as any;
        const list = ResearchOpportunityService.listOpportunities(accountId, status);
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: `查询机会卡失败: ${error.message}` });
    }
});

// 获取单个机会卡详情
router.get('/opportunities/:id', (req, res) => {
    try {
        const opp = ResearchOpportunityService.getOpportunity(req.params.id);
        if (!opp) return res.status(404).json({ error: '内容机会卡未找到' });
        res.json(opp);
    } catch (error: any) {
        res.status(500).json({ error: `获取机会卡详情失败: ${error.message}` });
    }
});

// 对机会卡进行决策 (采纳 ACCEPTED / 暂缓 DEFERRED / 舍弃 REJECTED)
router.put('/opportunities/:id/decide', (req, res) => {
    try {
        const { status, decisionReason } = req.body;
        if (!status || !['ACCEPTED', 'DEFERRED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: '决策状态必须是 ACCEPTED / DEFERRED / REJECTED 之一' });
        }

        const opportunity = ResearchOpportunityService.decideOpportunity(req.params.id, status, decisionReason);
        res.json({ success: true, opportunity });
    } catch (error: any) {
        res.status(500).json({ error: `更新决策失败: ${error.message}` });
    }
});

// 导出机会卡创作 Brief 上下文
router.get('/opportunities/:id/brief', (req, res) => {
    try {
        const brief = ResearchOpportunityService.exportOpportunityBrief(req.params.id);
        res.json({ id: req.params.id, brief });
    } catch (error: any) {
        res.status(500).json({ error: `导出创作 Brief 失败: ${error.message}` });
    }
});

export default router;
