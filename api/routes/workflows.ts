import { Router } from 'express';
import { WorkflowDerivationService, PlatformTarget } from '../services/core/WorkflowDerivationService.js';

const router = Router();

// --- 跨平台派生 (Cross-Platform Derivation) ---

// 将内容包派生为公众号长文、短视频脚本或微博
router.post('/derive', (req, res) => {
    try {
        const { packageId, targetPlatform } = req.body;
        if (!packageId || !targetPlatform) {
            return res.status(400).json({ error: '缺少必要参数: packageId, targetPlatform' });
        }

        const derived = WorkflowDerivationService.deriveContent(packageId, targetPlatform as PlatformTarget);
        res.json({ success: true, derived });
    } catch (error: any) {
        res.status(500).json({ error: `跨平台派生失败: ${error.message}` });
    }
});

// --- MCP (Model Context Protocol) 开放能力 ---

// 获取 MCP 工具声明清单
router.get('/mcp/tools', (_req, res) => {
    try {
        const tools = WorkflowDerivationService.listMcpTools();
        res.json({ success: true, tools });
    } catch (error: any) {
        res.status(500).json({ error: `获取 MCP 工具列表失败: ${error.message}` });
    }
});

// 执行 MCP 工具调用
router.post('/mcp/call', async (req, res) => {
    try {
        const { name, arguments: args } = req.body;
        if (!name) {
            return res.status(400).json({ error: '缺少工具名称 name' });
        }

        const result = await WorkflowDerivationService.executeMcpTool(name, args || {});
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: `MCP 执行失败: ${error.message}` });
    }
});

export default router;
