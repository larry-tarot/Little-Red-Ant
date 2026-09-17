import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, getTestDbSync, resetTestDb } from '../setup.js';

describe('BrandKitService (P2.3 品牌视觉资产与样图确认)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        const db = getTestDbSync();
        db.prepare("INSERT INTO accounts (id, nickname, is_active) VALUES (1, '极客硬件博主', 1)").run();
    });

    it('能够为账号初始化或读取品牌视觉规范（包含主色、强调色、背景底色、字体、封面版式与水印）', async () => {
        const { BrandKitService } = await import('../../api/services/core/BrandKitService.js');

        const kit = BrandKitService.getBrandKit(1);
        expect(kit).toBeDefined();
        expect(kit.accountId).toBe(1);
        expect(kit.primaryColor).toBeDefined();
        expect(kit.fontFamily).toBeDefined();
        expect(kit.coverLayout).toBeDefined();
        expect(kit.isApproved).toBe(false); // 初始未审核批准
    });

    it('支持更新品牌视觉规范，并重置批准状态为待确认', async () => {
        const { BrandKitService } = await import('../../api/services/core/BrandKitService.js');

        const updated = BrandKitService.updateBrandKit(1, {
            primaryColor: '#2563EB', // 科技蓝
            accentColor: '#F59E0B',
            backgroundColor: '#F8FAFC',
            textColor: '#0F172A',
            fontFamily: 'mono',
            watermarkText: '@极客硬件实验室',
            coverLayout: 'MAGAZINE'
        });

        expect(updated.primaryColor).toBe('#2563EB');
        expect(updated.fontFamily).toBe('mono');
        expect(updated.watermarkText).toBe('@极客硬件实验室');
        expect(updated.coverLayout).toBe('MAGAZINE');
        expect(updated.isApproved).toBe(false);
    });

    it('能够基于当前视觉规范实时渲染标准 3:4 样图预览（封面、论点页、CTA页）', async () => {
        const { BrandKitService } = await import('../../api/services/core/BrandKitService.js');

        const kit = BrandKitService.updateBrandKit(1, {
            primaryColor: '#FF2442',
            fontFamily: 'sans',
            watermarkText: '@电赛小助手'
        });

        const previews = BrandKitService.renderSamplePreviews(kit, {
            title: '无刷电机抗日光调试指南',
            keyPoint: '区分大功率功率地与小信号地'
        });

        expect(previews).toHaveLength(3); // 封面 Cover, 论点 Point, 尾页 CTA
        expect(previews[0].type).toBe('COVER');
        expect(previews[0].watermark).toBe('@电赛小助手');
        expect(previews[0].style.primaryColor).toBe('#FF2442');
        expect(previews[1].type).toBe('POINT');
        expect(previews[2].type).toBe('CTA');
    });

    it('创作者人工确认样图后，可将视觉资产固化为官方批准标准（APPROVED），以防风格漂移', async () => {
        const { BrandKitService } = await import('../../api/services/core/BrandKitService.js');

        BrandKitService.updateBrandKit(1, {
            primaryColor: '#059669', // 极客绿
            watermarkText: '@绿色嵌入式'
        });

        const approved = BrandKitService.approveBrandKit(1, 'sample_approved_v1.png');
        expect(approved.isApproved).toBe(true);
        expect(approved.approvedSampleUrl).toBe('sample_approved_v1.png');

        // 再次获取应保持批准状态
        const fetched = BrandKitService.getBrandKit(1);
        expect(fetched.isApproved).toBe(true);
        expect(fetched.primaryColor).toBe('#059669');
    });
});
