import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import workbenchRouter from '../../api/routes/workbench.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Workbench API Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/workbench', workbenchRouter);

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

    it('GET /api/workbench/today 返回结构合法的今日工作台视图，包含 today_actions', async () => {
        const res = await fetch(`${baseUrl}/api/workbench/today?accountId=1`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.data.account_name).toBe('极客博主');
        expect(json.data.today_actions).toBeDefined();
        expect(json.data.today_actions.pending_opportunities).toBeInstanceOf(Array);
        expect(json.data.today_actions.in_progress_packages).toBeInstanceOf(Array);
    });
});
