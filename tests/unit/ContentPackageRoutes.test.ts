import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import packagesRouter from '../../api/routes/packages.js';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('Content Packages API Routes (HTTP)', () => {
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

    it('POST & GET & PUT /api/packages 能够完成内容包创建、多版本演进与同步草稿', async () => {
        // 1. 创建内容包
        const createRes = await fetch(`${baseUrl}/api/packages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                title: '无刷电机发热自查与解决',
                targetAudience: '电赛初学者',
                coreValueProposition: '消除发热隐患',
                keyPoints: ['共地回路排查', '驱动波形'],
                bodyMarkdown: '# 正文排查步骤\n\n1. 测温\n2. 降频',
                coverTitleOptions: ['电机又发热？3招解决', '电赛必看']
            })
        });

        expect(createRes.status).toBe(201);
        const createData = await createRes.json();
        expect(createData.success).toBe(true);
        const pkgId = createData.package.id;
        expect(createData.package.currentVersion).toBe(1);

        // 2. 提交新版本
        const commitRes = await fetch(`${baseUrl}/api/packages/${pkgId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '无刷电机发热实战自查手册（进阶版）',
                bodyMarkdown: '# 正文进阶排查\n\n1. 测温并记录曲线\n2. 调整死区时间',
                changeSummary: '更新了进阶示波器死区时间测试'
            })
        });

        expect(commitRes.status).toBe(200);
        const commitData = await commitRes.json();
        expect(commitData.package.currentVersion).toBe(2);
        expect(commitData.package.versions).toHaveLength(2);

        // 3. 一键同步导出为 Draft
        const exportRes = await fetch(`${baseUrl}/api/packages/${pkgId}/export-draft`, {
            method: 'POST'
        });
        expect(exportRes.status).toBe(200);
        const exportData = await exportRes.json();
        expect(exportData.success).toBe(true);
        expect(exportData.draftId).toBeGreaterThan(0);
    });
});
