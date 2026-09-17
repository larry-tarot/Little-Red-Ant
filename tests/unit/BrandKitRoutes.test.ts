import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import accountsRouter from '../../api/routes/accounts.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Brand Kit API Routes (HTTP)', () => {
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
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '极客博主', 1)").run();
    });

    it('GET & PUT & POST /api/accounts/:id/brand-kit 能够查询、修改并批准品牌视觉资产', async () => {
        // 1. 查询默认视觉资产
        const getRes = await fetch(`${baseUrl}/api/accounts/1/brand-kit`);
        expect(getRes.status).toBe(200);
        const getData = await getRes.json();
        expect(getData.brandKit.primaryColor).toBe('#FF2442');
        expect(getData.samplePreviews).toHaveLength(3);
        expect(getData.brandKit.isApproved).toBe(false);

        // 2. 更新视觉资产
        const putRes = await fetch(`${baseUrl}/api/accounts/1/brand-kit`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                primaryColor: '#2563EB',
                fontFamily: 'mono',
                watermarkText: '@科技硬核说'
            })
        });
        expect(putRes.status).toBe(200);
        const putData = await putRes.json();
        expect(putData.brandKit.primaryColor).toBe('#2563EB');
        expect(putData.brandKit.watermarkText).toBe('@科技硬核说');
        expect(putData.brandKit.isApproved).toBe(false);

        // 3. 创作者人工核验并批准
        const approveRes = await fetch(`${baseUrl}/api/accounts/1/brand-kit/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sampleSnapshotUrl: '/uploads/sample_approved_1.png'
            })
        });
        expect(approveRes.status).toBe(200);
        const approveData = await approveRes.json();
        expect(approveData.brandKit.isApproved).toBe(true);
        expect(approveData.brandKit.approvedSampleUrl).toBe('/uploads/sample_approved_1.png');
    });
});
