import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import researchRouter from '../../api/routes/research.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Research & Opportunities API Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/research', researchRouter);

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
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '极客博主', 1)").run();
    });

    it('POST & GET /api/research/evidence 能够录入并查询研究证据', async () => {
        const postRes = await fetch(`${baseUrl}/api/research/evidence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                sourceType: 'COMMENT',
                rawText: '请问有推荐的405nm滤光片吗？抗日光干扰太难了。',
                painPoints: ['强光下光斑冲刷', '滤光片选型困难']
            })
        });

        expect(postRes.status).toBe(201);
        const postData = await postRes.json();
        expect(postData.success).toBe(true);
        expect(postData.evidence.id).toBeDefined();

        const getRes = await fetch(`${baseUrl}/api/research/evidence?accountId=1`);
        expect(getRes.status).toBe(200);
        const list = await getRes.json();
        expect(list).toHaveLength(1);
        expect(list[0].rawText).toContain('405nm滤光片');
    });

    it('POST & GET & PUT /api/research/opportunities 能够创建机会卡、决策采纳与导出 Brief', async () => {
        // 1. 录入一条证据
        const evRes = await fetch(`${baseUrl}/api/research/evidence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                sourceType: 'DM',
                rawText: '希望能出一个双轴云台接STM32的接线避坑指南，很多人地线没接对烧了单片机。',
                painPoints: ['接线烧板子', '共地干扰']
            })
        });
        const evData = await evRes.json();
        const evId = evData.evidence.id;

        // 2. 创建内容机会卡
        const oppRes = await fetch(`${baseUrl}/api/research/opportunities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                title: 'STM32驱动双轴无刷云台防烧板与共地指南',
                targetAudience: '电赛与机器人新手',
                scenario: '第一次接线通电调试时',
                problem: '电源地与信号地回路不当导致芯片损坏',
                uniqueAngle: '展示自测损坏芯片原因及隔离电路建议',
                contentFormat: 'TUTORIAL',
                expectedOutcome: 'TRUST',
                contentPillar: '硬件避坑',
                evidenceIds: [evId]
            })
        });

        expect(oppRes.status).toBe(201);
        const oppData = await oppRes.json();
        const oppId = oppData.opportunity.id;
        expect(oppData.opportunity.status).toBe('IDEA');
        expect(oppData.opportunity.evidence).toHaveLength(1);

        // 3. 决策采纳
        const decideRes = await fetch(`${baseUrl}/api/research/opportunities/${oppId}/decide`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'ACCEPTED',
                decisionReason: '极高频踩坑，适合下期图文'
            })
        });
        expect(decideRes.status).toBe(200);
        const decideData = await decideRes.json();
        expect(decideData.opportunity.status).toBe('ACCEPTED');

        // 4. 获取导出上下文
        const briefRes = await fetch(`${baseUrl}/api/research/opportunities/${oppId}/brief`);
        expect(briefRes.status).toBe(200);
        const briefData = await briefRes.json();
        expect(briefData.brief).toContain('STM32驱动双轴无刷云台防烧板与共地指南');
        expect(briefData.brief).toContain('希望能出一个双轴云台接STM32的接线避坑指南');
    });
});
