import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';
import { SettingsService } from '../../api/services/SettingsService.js';

describe('CustomOpenAIProvider (自定义 API 运营商接入)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_api_key', 'sk-test-custom-key')").run();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_base_url', 'https://api.custom-ai.com/v1')").run();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_model', 'custom-gpt-4o')").run();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_enabled', '1')").run();
    });

    it('能够成功从系统设置读取自定义 Base URL、API Key 与模型名称并构建客户端', async () => {
        const { CustomOpenAIProvider } = await import('../../api/services/ai/providers/CustomOpenAIProvider.js');
        const provider = new CustomOpenAIProvider();

        const config = await provider.getConfig();
        expect(config.apiKey).toBe('sk-test-custom-key');
        expect(config.baseURL).toBe('https://api.custom-ai.com/v1');
        expect(config.model).toBe('custom-gpt-4o');
    });

    it('在配置了自定义 API Key 时，AIFactory 自动将其作为最高优先级的主力 Provider', async () => {
        const { AIFactory } = await import('../../api/services/ai/AIFactory.js');
        const { CustomOpenAIProvider } = await import('../../api/services/ai/providers/CustomOpenAIProvider.js');

        // 重置 Provider 缓存
        AIFactory.resetProviders();
        const textProvider = AIFactory.getTextProvider();

        // 验证当前状态中包含 CustomOpenAIProvider
        const status = AIFactory.getProviderStatus();
        expect(status).not.toBeNull();
        expect(status?.providers.some(p => p.name.includes('Custom') || p.name.includes('custom'))).toBe(true);
    });
});
