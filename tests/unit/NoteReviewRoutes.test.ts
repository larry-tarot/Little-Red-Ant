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

    it('GET /api/reviews/syncable-notes 与 POST /api/reviews/auto-create 支持自动拉取笔记指标并生成复盘', async () => {
        const db = getTestDbSync();
        db.prepare(`
            INSERT INTO note_stats (
                id, note_id, title, views, likes, collects, comments, account_id, publish_date
            ) VALUES (
                20, 'note_auto_1', '单片机死区时间调测记录', 6000, 320, 480, 20, 1, '2026-09-13 10:00:00'
            )
        `).run();

        // 1. 查询可同步笔记
        const listRes = await fetch(`${baseUrl}/api/reviews/syncable-notes?accountId=1`);
        expect(listRes.status).toBe(200);
        const listData = await listRes.json();
        expect(listData.notes.some((n: any) => n.noteId === 'note_auto_1')).toBe(true);

        // 2. 自动根据笔记指标创建复盘
        const autoRes = await fetch(`${baseUrl}/api/reviews/auto-create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                noteId: 'note_auto_1'
            })
        });

        expect(autoRes.status).toBe(201);
        const autoData = await autoRes.json();
        expect(autoData.success).toBe(true);
        expect(autoData.review.title).toBe('单片机死区时间调测记录');
        expect(autoData.review.views).toBe(6000);
        expect(autoData.review.collects).toBe(480);
    });
});
