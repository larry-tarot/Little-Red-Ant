import { Router } from 'express';
import { AIFactory } from '../services/ai/AIFactory.js';
import { AIHealthService } from '../services/ai/AIHealthService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * 获取当前 AI Provider 状态
 *
 * 返回 AIFactory 中 CompositeProvider 的实时状态，包括：
 * - activeProvider: 当前主用 Provider
 * - providers: 各子 Provider 的断路器状态、失败次数、最近失败信息等
 */
router.get('/status', authenticateToken, async (_req, res) => {
    try {
        const status = AIFactory.getProviderStatus();
        res.json({ success: true, data: status });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message || '获取 AI Provider 状态失败'
        });
    }
});

/**
 * 触发 DeepSeek 与 Aliyun 两个 Provider 的健康检查
 *
 * 会实际调用一次最小化文本生成，测量延迟并返回健康结果。
 * 单次检查超时时间为 15 秒。
 */
router.post('/check', authenticateToken, async (_req, res) => {
    try {
        const results = await Promise.all([
            AIHealthService.checkProvider('deepseek'),
            AIHealthService.checkProvider('aliyun')
        ]);
        res.json({ success: true, data: results });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message || 'AI Provider 健康检查失败'
        });
    }
});

export default router;
