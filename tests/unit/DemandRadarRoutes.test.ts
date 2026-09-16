import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import radarRouter from '../../api/routes/radar.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Demand Radar API Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/radar', radarRouter);

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
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '硬件博主', 1)").run();
    });

    it('POST & GET & DELETE /api/radar/watches 能够增删查关键词雷达', async () => {
        // 1. 添加监控项
        const postRes = await fetch(`${baseUrl}/api/radar/watches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                keyword: 'STM32无刷云台',
                category: '硬件教程',
                targetAudience: '电子信息备赛生',
                minLikesThreshold: 80
            })
        });

        expect(postRes.status).toBe(201);
        const postData = await postRes.json();
        expect(postData.success).toBe(true);
        const watchId = postData.watch.id;

        // 2. 列表查询
        const getRes = await fetch(`${baseUrl}/api/radar/watches?accountId=1`);
        expect(getRes.status).toBe(200);
        const list = await getRes.json();
        expect(list).toHaveLength(1);
        expect(list[0].keyword).toBe('STM32无刷云台');

        // 3. 删除
        const delRes = await fetch(`${baseUrl}/api/radar/watches/${watchId}`, {
            method: 'DELETE'
        });
        expect(delRes.status).toBe(200);
        const delData = await delRes.json();
        expect(delData.success).toBe(true);
    });

    it('POST /api/radar/synthesize 与 POST /api/radar/adopt 能够合成并采纳机会卡', async () => {
        // 1. 合成候选机会
        const synthRes = await fetch(`${baseUrl}/api/radar/synthesize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                keyword: '405nm狭带滤波',
                targetAudience: '电赛视觉组',
                signals: [
                    {
                        sourceType: 'COMMENT',
                        rawText: '请教滤光片能完全过滤太阳光吗？户外实测噪点还是很多',
                        author: '视觉小生'
                    }
                ]
            })
        });

        expect(synthRes.status).toBe(200);
        const synthData = await synthRes.json();
        expect(synthData.success).toBe(true);
        const candidate = synthData.candidate;
        expect(candidate.title).toContain('405nm狭带滤波');

        // 2. 采纳候选机会为 P1.2 机会卡
        const adoptRes = await fetch(`${baseUrl}/api/radar/adopt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidate })
        });

        expect(adoptRes.status).toBe(201);
        const adoptData = await adoptRes.json();
        expect(adoptData.success).toBe(true);
        expect(adoptData.opportunity.status).toBe('ACCEPTED');
    });
});
