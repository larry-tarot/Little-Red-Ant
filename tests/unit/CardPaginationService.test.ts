import { describe, expect, it } from 'vitest';
import { CardPaginationService, CardSlide } from '../../api/services/core/CardPaginationService.js';

describe('CardPaginationService (P1.4 简易图文分页引擎)', () => {
    it('能够将结构化内容包（标题、论点、正文脚本）智能切分为符合小红书浏览习惯的 3:4 多页幻灯片结构', () => {
        const slides = CardPaginationService.splitIntoSlides({
            title: '无刷电机抗强光调试实操清单',
            targetAudience: '电赛新手',
            keyPoints: [
                '区分功率地与信号地，杜绝MCU共地干扰',
                '示波器监测相电流纹波，调低I环增益',
                '加装405nm狭带滤光片抑制户外日光'
            ],
            bodyMarkdown: `很多人一调试无刷电机就遇到发烫失步。\n\n第一步务必先检查地线回路。\n\n第二步看示波器波形，避免死区时间过短导致直通。\n\n第三步户外测试必须加滤光片，否则摄像头感光饱和无法追踪。`,
            tags: ['嵌入式', 'STM32', '无刷电机']
        });

        // 验证切页逻辑
        expect(slides.length).toBeGreaterThanOrEqual(4); // 1页封面 + 3页论点卡 + 可选总结页
        
        // 第 1 页必定为 COVER
        expect(slides[0].type).toBe('COVER');
        expect(slides[0].slideNumber).toBe(1);
        expect(slides[0].headline).toBe('无刷电机抗强光调试实操清单');
        expect(slides[0].badge).toBe('电赛新手');

        // 中间页必须为 POINT 论点卡
        expect(slides[1].type).toBe('POINT');
        expect(slides[1].slideNumber).toBe(2);
        expect(slides[1].headline).toContain('区分功率地与信号地');
        expect(slides[1].points).toBeDefined();

        expect(slides[2].type).toBe('POINT');
        expect(slides[2].slideNumber).toBe(3);
        expect(slides[2].headline).toContain('示波器监测相电流纹波');

        // 最后一页通常为 SUMMARY 或 CTA
        const lastSlide = slides[slides.length - 1];
        expect(['POINT', 'SUMMARY', 'CTA']).toContain(lastSlide.type);
    });

    it('支持按字数限制和段落平滑切页，单页正文不会过度拥挤或截断句子', () => {
        const slides = CardPaginationService.splitIntoSlides({
            title: '极简排查指南',
            keyPoints: [],
            bodyMarkdown: '第一段重点排查内容。\n\n第二段进阶操作指引。\n\n第三段最终总结避坑。',
            includeCta: false
        });

        expect(slides.length).toBe(4); // 封面 + 3段
        expect(slides[0].type).toBe('COVER');
        expect(slides[1].body).toContain('第一段重点排查内容');
        expect(slides[2].body).toContain('第二段进阶操作指引');
        expect(slides[3].body).toContain('第三段最终总结避坑');
    });

    it('能够组装出包含发布前审所需全部要素的最终发布包结构（Release Bundle）', () => {
        const bundle = CardPaginationService.buildReleaseBundle({
            accountId: 1,
            packageId: 'pkg_123',
            versionNumber: 2,
            title: '无刷电机实操清单',
            bodyMarkdown: '正文描述...',
            tags: ['单片机', '电赛'],
            slides: [
                { slideNumber: 1, type: 'COVER', headline: '无刷电机实操清单' },
                { slideNumber: 2, type: 'POINT', headline: '要点一' }
            ],
            imageUrls: ['/assets/slide1.png', '/assets/slide2.png']
        });

        expect(bundle.accountId).toBe(1);
        expect(bundle.packageId).toBe('pkg_123');
        expect(bundle.versionNumber).toBe(2);
        expect(bundle.images).toHaveLength(2);
        expect(bundle.images[0]).toBe('/assets/slide1.png');
        expect(bundle.slidesCount).toBe(2);
        expect(bundle.requiresHumanConfirm).toBe(true);
    });
});
