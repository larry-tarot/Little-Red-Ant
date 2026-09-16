export type SlideType = 'COVER' | 'POINT' | 'SUMMARY' | 'CTA';

export interface CardSlide {
    slideNumber: number;
    type: SlideType;
    badge?: string;
    headline: string;
    subheadline?: string;
    points?: string[];
    body?: string;
    footerNote?: string;
}

export interface ReleaseBundle {
    accountId: number;
    packageId?: string;
    versionNumber?: number;
    title: string;
    content: string;
    tags: string[];
    slides: CardSlide[];
    images: string[];
    slidesCount: number;
    requiresHumanConfirm: boolean;
    createdAt: string;
}

export class CardPaginationService {
    /**
     * 将内容包属性切分为适合 3:4 小红书幻灯片的卡片列表
     */
    static splitIntoSlides(params: {
        title: string;
        targetAudience?: string;
        keyPoints?: string[];
        bodyMarkdown?: string;
        tags?: string[];
        includeCta?: boolean;
    }): CardSlide[] {
        const slides: CardSlide[] = [];
        let slideIndex = 1;
        const includeCta = params.includeCta !== false; // 默认生成尾页 CTA

        // 1. 第一页：封面 Cover Slide
        slides.push({
            slideNumber: slideIndex++,
            type: 'COVER',
            badge: params.targetAudience || '干货指南',
            headline: params.title,
            subheadline: (params.keyPoints && params.keyPoints.length > 0)
                ? `本篇核心包含 ${params.keyPoints.length} 个关键避坑要点`
                : '请向左滑动阅读全文'
        });

        // 2. 中间页：若存在结构化 KeyPoints，优先以论点卡切页
        const keyPoints = params.keyPoints || [];
        if (keyPoints.length > 0) {
            keyPoints.forEach((point, idx) => {
                slides.push({
                    slideNumber: slideIndex++,
                    type: 'POINT',
                    badge: `POINT 0${idx + 1}`,
                    headline: point,
                    points: [point],
                    footerNote: `${idx + 1} / ${keyPoints.length}`
                });
            });
        } else if (params.bodyMarkdown) {
            // 没有结构化论点卡时，基于段落 Markdown 进行自适应平滑拆分
            const paragraphs = params.bodyMarkdown
                .split(/\n\s*\n/)
                .map(p => p.trim())
                .filter(p => p.length > 0 && !p.startsWith('#')); // 滤掉顶级大标题

            paragraphs.forEach((para, idx) => {
                const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
                const firstLine = lines[0] || `要点 0${idx + 1}`;
                const rest = lines.slice(1).join('\n') || para;

                slides.push({
                    slideNumber: slideIndex++,
                    type: 'POINT',
                    badge: `SECTION 0${idx + 1}`,
                    headline: firstLine.length > 25 ? firstLine.slice(0, 25) + '...' : firstLine,
                    body: rest,
                    footerNote: `${idx + 1} / ${paragraphs.length}`
                });
            });
        }

        // 3. 最后一页：总结 / CTA 页
        if (slides.length > 1 && includeCta) {
            slides.push({
                slideNumber: slideIndex++,
                type: 'CTA',
                badge: 'SUMMARY',
                headline: '总结与互动',
                subheadline: '如果对你有帮助，建议点赞收藏防丢失',
                points: ['欢迎在评论区留下你踩过的坑', '更多实战技巧持续更新中']
            });
        }

        return slides;
    }

    /**
     * 组装完整的发布包结构
     */
    static buildReleaseBundle(params: {
        accountId: number;
        packageId?: string;
        versionNumber?: number;
        title: string;
        bodyMarkdown: string;
        tags?: string[];
        slides: CardSlide[];
        imageUrls: string[];
    }): ReleaseBundle {
        return {
            accountId: params.accountId,
            packageId: params.packageId,
            versionNumber: params.versionNumber,
            title: params.title,
            content: params.bodyMarkdown,
            tags: params.tags || [],
            slides: params.slides,
            images: params.imageUrls,
            slidesCount: params.slides.length,
            requiresHumanConfirm: true, // 严格遵守人机协同规范，发布前强制人工确认
            createdAt: new Date().toISOString()
        };
    }
}
