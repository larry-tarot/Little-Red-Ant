import { Router } from 'express';
import { SettingsService } from '../services/SettingsService.js';
import { startSyncJob } from '../services/cron.js';
import { requireAdmin } from '../middleware/roles.js';
import { validateBody } from '../middleware/validation.js';
import { SettingsUpdateSchema, SettingsTestConnectionSchema } from '../schemas/index.js';

const router = Router();

// Get all settings
router.get('/', async (_req, res) => {
    try {
        const settings = await SettingsService.getAll();
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update settings (Bulk or Single)
router.post('/', requireAdmin, validateBody(SettingsUpdateSchema), async (req, res) => {
    try {
        const updates = req.body; // Expect { key: value, key2: value2 }

        for (const [key, value] of Object.entries(updates)) {
            // Basic validation if needed
            if (typeof value === 'string') {
                await SettingsService.set(key, value);

                // If sync schedule changed, restart cron job
                if (key === 'SYNC_SCHEDULE') {
                    startSyncJob(value);
                }
            }
        }

        res.json({ success: true, message: 'Settings updated' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Test API Key connection
router.post('/test-connection', validateBody(SettingsTestConnectionSchema), async (req, res) => {
    try {
        const { key } = req.body;
        if (!key || !['aliyun_api_key', 'deepseek_api_key'].includes(key)) {
            return res.status(400).json({ success: false, message: 'Invalid key type' });
        }

        // Get the API key from settings or env
        const apiKey = await SettingsService.get(key) || process.env[key.toUpperCase()] || '';
        if (!apiKey) {
            return res.json({ success: false, message: 'API Key 未配置' });
        }

        // Try to make a minimal HTTP request to verify the key
        if (key === 'aliyun_api_key') {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'qwen-turbo',
                    input: { messages: [{ role: 'user', content: 'Hi' }] },
                    parameters: { result_format: 'message', max_tokens: 5 }
                }),
                timeout: 10000,
            });

            if (response.ok) {
                res.json({ success: true, message: '连接成功' });
            } else {
                const body = await response.text().catch(() => '');
                res.json({ success: false, message: body || 'API 返回错误' });
            }
        } else if (key === 'deepseek_api_key') {
            const fetch = (await import('node-fetch')).default;
            const baseUrl = (await SettingsService.get('deepseek_base_url')) || 'https://api.deepseek.com';
            const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5
                }),
                timeout: 10000,
            });

            if (response.ok) {
                res.json({ success: true, message: '连接成功' });
            } else {
                const body = await response.text().catch(() => '');
                res.json({ success: false, message: body || 'API 返回错误' });
            }
        } else {
            res.json({ success: false, message: 'Unsupported key type' });
        }
    } catch (error: any) {
        res.json({ success: false, message: error.message || '连接失败' });
    }
});

// Check if demo mode (no API keys configured)
router.get('/demo-mode', async (_req, res) => {
    const { DemoService } = await import('../services/DemoService.js');
    const isDemo = await DemoService.isDemoMode();
    res.json({ demoMode: isDemo });
});

export default router;
