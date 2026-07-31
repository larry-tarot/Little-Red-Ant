
import { Page } from 'playwright';

export interface ScrapeResult {
    info: {
        nickname: string;
        avatar: string;
        desc: string;
        stats: string;
        fans_count?: number;
        notes_count?: number;
        likes_count?: number;
    };
    notes: any[];
    source: 'API' | 'DOM';
}

export interface ScrapingStrategy {
    /**
     * 功能描述：在页面导航前预设置拦截器/监听（可选）
     *
     * 设计思路：
     * - API 拦截策略需要在 page.goto 之前设置 route，否则首屏请求无法捕获
     * - DOM 策略无需预设置，可空实现
     */
    setup?(page: Page, userId: string, signal?: AbortSignal): Promise<void>;

    execute(page: Page, userId: string, signal?: AbortSignal): Promise<ScrapeResult | null>;
}
