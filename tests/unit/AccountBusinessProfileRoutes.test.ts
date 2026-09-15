import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import accountsRouter from '../../api/routes/accounts.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Account Business Profile API Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/accounts', accountsRouter);

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
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '测试博主', 1)").run();
    });

    it('GET /api/accounts/:id/business-profile 返回初始默认档案', async () => {
        const res = await fetch(`${baseUrl}/api/accounts/1/business-profile`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.accountId).toBe(1);
        expect(data.goals).toEqual([]);
        expect(data.isComplete).toBe(false);
    });

    it('PUT /api/accounts/:id/business-profile 保存并返回最新经营档案', async () => {
        const profile = {
            goals: ['打造自动化硬件IP'],
            targetAudience: {
                identity: '极客与工程师',
                painPoints: ['缺乏工程级源码'],
                misconceptions: ['以为写脚本很简单']
            },
            uniqueCapabilities: ['自研双JC2804云台驱动'],
            contentPillars: [
                { name: '云台调优', description: '高精度测试', targetRatio: 100 }
            ],
            expressionBoundaries: ['不演示危险操作'],
            toneStyle: '硬核客观'
        };

        const putRes = await fetch(`${baseUrl}/api/accounts/1/business-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });

        expect(putRes.status).toBe(200);
        const putData = await putRes.json();
        expect(putData.success).toBe(true);
        expect(putData.profile.goals).toEqual(profile.goals);
        expect(putData.profile.isComplete).toBe(true);

        const getRes = await fetch(`${baseUrl}/api/accounts/1/business-profile`);
        expect(getRes.status).toBe(200);
        const getData = await getRes.json();
        expect(getData.uniqueCapabilities).toContain('自研双JC2804云台驱动');
    });

    it('GET /api/accounts/:id/prompt-context 导出格式化上下文字符串', async () => {
        await fetch(`${baseUrl}/api/accounts/1/business-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                goals: ['专业咨询'],
                targetAudience: { identity: '电赛选手', painPoints: ['激光不准'], misconceptions: [] },
                uniqueCapabilities: ['405nm激光精细调优经验'],
                contentPillars: [{ name: '电赛答疑', description: '视觉算法' }],
                expressionBoundaries: ['严禁代做比赛'],
                toneStyle: '客观求实'
            })
        });

        const res = await fetch(`${baseUrl}/api/accounts/1/prompt-context`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.promptContext).toContain('目标受众: 电赛选手');
        expect(data.promptContext).toContain('表达红线与禁区: 严禁代做比赛');
    });
});
