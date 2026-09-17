import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import seriesRouter from '../../api/routes/series.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Content Series and Matrix Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/series', seriesRouter);

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

    it('POST & GET /api/series 能够创建专栏并查询列表', async () => {
        const postRes = await fetch(`${baseUrl}/api/series`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                title: '电赛视觉从零到一',
                description: '专栏描述...',
                targetPillar: '实战拆解',
                plannedCount: 8
            })
        });

        expect(postRes.status).toBe(201);
        const postData = await postRes.json();
        expect(postData.success).toBe(true);
        expect(postData.series.title).toBe('电赛视觉从零到一');
        expect(postData.series.plannedCount).toBe(8);

        const getRes = await fetch(`${baseUrl}/api/series?accountId=1`);
        expect(getRes.status).toBe(200);
        const list = await getRes.json();
        expect(list).toHaveLength(1);
    });

    it('GET /api/series/pillar-balance 与 GET /api/series/matrix 返回合法的栏目健康与多账号矩阵', async () => {
        const balanceRes = await fetch(`${baseUrl}/api/series/pillar-balance?accountId=1`);
        expect(balanceRes.status).toBe(200);
        const balanceData = await balanceRes.json();
        expect(balanceData.success).toBe(true);
        expect(balanceData.balance.recommendation).toBeDefined();

        const matrixRes = await fetch(`${baseUrl}/api/series/matrix`);
        expect(matrixRes.status).toBe(200);
        const matrixData = await matrixRes.json();
        expect(matrixData.success).toBe(true);
        expect(matrixData.matrix.some((m: any) => m.accountId === 1)).toBe(true);
    });
});
