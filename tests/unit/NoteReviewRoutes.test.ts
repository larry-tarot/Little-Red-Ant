import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import reviewsRouter from '../../api/routes/reviews.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Note Reviews API Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/reviews', reviewsRouter);

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
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '极客硬件博主', 1)").run();
    });

    it('POST & GET & POST derive-opportunity /api/reviews 能够创建复盘并反哺生成机会卡', async () => {
        // 1. 创建复盘
        const postRes = await fetch(`${baseUrl}/api/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                title: '405nm狭带滤波实测笔记',
                publishedAt: '2026-09-12',
                views: 8900,
                likes: 540,
                collects: 680,
                comments: 52,
                whatWorked: '第3页强光对比图极其震撼',
                whatFailed: '很多新手问怎么给MaixCAM配C接口转接环',
                feedbackSignals: ['很多人追问转接环型号和购买渠道'],
                nextActionIdeas: ['写一期《MaixCAM镜头卡口与转接环避坑清单》']
            })
        });

        expect(postRes.status).toBe(201);
        const postData = await postRes.json();
        expect(postData.success).toBe(true);
        const reviewId = postData.review.id;

        // 2. 列表查询
        const getRes = await fetch(`${baseUrl}/api/reviews?accountId=1`);
        expect(getRes.status).toBe(200);
        const list = await getRes.json();
        expect(list).toHaveLength(1);
        expect(list[0].title).toBe('405nm狭带滤波实测笔记');

        // 3. 一键反哺生成内容机会卡
        const deriveRes = await fetch(`${baseUrl}/api/reviews/${reviewId}/derive-opportunity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ideaIndex: 0,
                targetAudience: 'MaixCAM与电赛硬件开发者'
            })
        });

        expect(deriveRes.status).toBe(201);
        const deriveData = await deriveRes.json();
        expect(deriveData.success).toBe(true);
        expect(deriveData.opportunity.title).toContain('镜头卡口与转接环避坑清单');
        expect(deriveData.opportunity.status).toBe('IDEA');
    });
});
