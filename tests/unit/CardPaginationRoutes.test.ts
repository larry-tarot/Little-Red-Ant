import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import packagesRouter from '../../api/routes/packages.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Card Pagination and Release Bundle Routes (HTTP)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/packages', packagesRouter);

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

    it('POST /api/packages/:id/slides 能够计算并返回 3:4 幻灯片卡片切页', async () => {
        // 先建一个 package
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');
        const pkg = ContentPackageService.createPackage({
            accountId: 1,
            title: '无刷电机接线指南',
            targetAudience: '电赛新手',
            keyPoints: ['共地回路', '死区时间'],
            bodyMarkdown: '正文排查步骤...'
        });

        const res = await fetch(`${baseUrl}/api/packages/${pkg.id}/slides`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.slides.length).toBeGreaterThanOrEqual(3);
        expect(data.slides[0].type).toBe('COVER');
    });

    it('POST /api/packages/:id/release-bundle 能够组装最终待发布包', async () => {
        const { ContentPackageService } = await import('../../api/services/core/ContentPackageService.js');
        const pkg = ContentPackageService.createPackage({
            accountId: 1,
            title: '无刷电机防烧指南',
            bodyMarkdown: '正文内容...',
            tags: ['STM32', '单片机']
        });

        const res = await fetch(`${baseUrl}/api/packages/${pkg.id}/release-bundle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrls: ['http://localhost/img1.png', 'http://localhost/img2.png']
            })
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.bundle.requiresHumanConfirm).toBe(true);
        expect(data.bundle.images).toHaveLength(2);
    });
});
