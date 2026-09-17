import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import workflowsRouter from '../../api/routes/workflows.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Workflow and Derivation API Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/workflows', workflowsRouter);

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => {
                const address = server.address();
                if (address && typeof address === 'object') {
                    baseUrl = `http://127.0.0.1:${address.port}`;
                }
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT OR REPLACE INTO accounts (id, nickname, is_active) VALUES (1, '极客主号', 1)").run();
    });

    it('POST /api/workflows/derive 能够将内容包成功派生为不同平台制品', async () => {
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');
        const pkg = ContentPackageService.createPackage({
            accountId: 1,
            title: '405nm滤光片抗日光调试实测',
            bodyMarkdown: '正文...',
            keyPoints: ['要点1', '要点2']
        });

        const res = await fetch(`${baseUrl}/api/workflows/derive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                packageId: pkg.id,
                targetPlatform: 'VIDEO_SCRIPT'
            })
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.derived.platform).toBe('VIDEO_SCRIPT');
        expect(data.derived.scenes.length).toBeGreaterThan(0);
    });

    it('GET & POST /api/workflows/mcp 符合标准 MCP 规范，支持外部模型/Agent 工具调用', async () => {
        // 1. 获取 MCP 工具清单
        const toolsRes = await fetch(`${baseUrl}/api/workflows/mcp/tools`);
        expect(toolsRes.status).toBe(200);
        const toolsData = await toolsRes.json();
        expect(toolsData.success).toBe(true);
        expect(toolsData.tools.some((t: any) => t.name === 'chimera_get_account_profile')).toBe(true);

        // 2. 调用 MCP 工具查询 profile
        const callRes = await fetch(`${baseUrl}/api/workflows/mcp/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'chimera_get_account_profile',
                arguments: { accountId: 1 }
            })
        });

        expect(callRes.status).toBe(200);
        const callData = await callRes.json();
        expect(callData.success).toBe(true);
        expect(callData.result.content[0].text).toContain('"accountId": 1');
    });
});
