/**
 * BrowserService —— Sprint 4 之后的形态。
 *
 * 改造要点:
 *   - 保留 getInstance() + getAuthenticatedPage() + closeAll() 三个外部入口
 *     (避免在 publish.ts、stats.ts、auth.ts 等 7+ 个调用点大改)
 *   - 内部委托给一个 IBrowserDriver 实例(默认 Playwright,可切 Camoufox)
 *   - 通过环境变量 RPA_DRIVER 选择:playwright(默认) | camoufox(实验)
 *
 * 选型:不删除 BrowserService 这个类,只让它变成"门面(Facade)"。
 *       这是为了把 Sprint 4 的影响面降到最小 —— 所有调用点零改动。
 */

import { Logger } from '../LoggerService.js';
import type { IBrowserDriver } from './interfaces/IBrowserDriver.js';
import { PlaywrightDriver } from './drivers/PlaywrightDriver.js';
import { CamoufoxDriver } from './drivers/CamoufoxDriver.js';
import { RPAUtils } from './utils/RPAUtils.js';
import * as RpaPageHelpers from './RpaPageHelpers.js';

export class BrowserService {
    private static instance: BrowserService;
    private driver: IBrowserDriver;

    private constructor() {
        const driverName = (process.env.RPA_DRIVER || 'playwright').toLowerCase();
        if (driverName === 'camoufox') {
            Logger.info('BrowserService', 'Initializing CamoufoxDriver (experimental)');
            this.driver = new CamoufoxDriver();
        } else {
            if (driverName !== 'playwright') {
                Logger.warn('BrowserService', `Unknown RPA_DRIVER="${driverName}", falling back to playwright`);
            }
            this.driver = new PlaywrightDriver();
        }
        Logger.info('BrowserService', `Active driver: ${this.driver.driverName}`);
    }

    public static getInstance(): BrowserService {
        if (!BrowserService.instance) {
            BrowserService.instance = new BrowserService();
        }
        return BrowserService.instance;
    }

    /**
     * Acquire an authenticated page.
     * The signature matches the original BrowserService.getAuthenticatedPage so
     * existing call sites (publish.ts, stats.ts, etc.) need no changes.
     */
    public async getAuthenticatedPage(
        type: 'CREATOR' | 'MAIN_SITE' | 'ANONYMOUS',
        headless: boolean = true,
        accountId?: number
    ): Promise<{ _browser: any; browser: any; context: any; page: any }> {
        const result = await this.driver.getAuthenticatedPage({
            purpose: type,
            headless,
            accountId,
        });
        // Inject environment polyfills (e.g., __name) into every page we hand out.
        await RPAUtils.initPage(result.page);
        // 原 API 暴露 { browser, context, page }；同时保留 _browser 别名，
        // 让现有调用方（publish.ts、comments.ts 等）无需修改。
        return {
            _browser: result.browser,
            browser: result.browser,
            context: result.context,
            page: result.page,
        };
    }

    /**
     * Close all active browser contexts.
     * Called on graceful shutdown.
     */
    public async closeAll(): Promise<void> {
        await this.driver.closeAll();
    }

    /**
     * Read-only access to the active driver (for diagnostics, health checks).
     */
    public getActiveDriverName(): string {
        return this.driver.driverName;
    }

    /**
     * 功能描述：验证页面登录状态
     *
     * 参数说明：
     * - page: [any] Playwright 页面实例
     * - type: ['MAIN_SITE' | 'CREATOR'] 站点类型
     *
     * 返回说明：
     * - boolean true 表示已登录
     */
    public static async verifyLoginState(
        page: any,
        type: 'MAIN_SITE' | 'CREATOR'
    ): Promise<boolean> {
        return RpaPageHelpers.verifyLoginState(page, type);
    }

    /**
     * 功能描述：检测页面是否被反爬/验证码/频率限制拦截
     *
     * 参数说明：
     * - page: [any] Playwright 页面实例
     *
     * 返回说明：
     * - { blocked: boolean; reason?: string }
     */
    public static async detectAntiBot(
        page: any
    ): Promise<{ blocked: boolean; reason?: string }> {
        return RpaPageHelpers.detectAntiBot(page);
    }

    /**
     * 功能描述：等待页面稳定
     *
     * 参数说明：
     * - page: [any] Playwright 页面实例
     * - ms: [number] 等待毫秒数，默认 2000ms
     */
    public static async waitForPageStable(page: any, ms?: number): Promise<void> {
        return RpaPageHelpers.waitForPageStable(page, ms);
    }

    /**
     * 功能描述：校验页面是否符合预期条件
     *
     * 参数说明：
     * - page: [any] Playwright 页面实例
     * - options: [object] 包含 expectedUrl / requiredText / forbiddenText
     */
    public static async validatePage(
        page: any,
        options: {
            expectedUrl?: string;
            requiredText?: string;
            forbiddenText?: string;
        }
    ): Promise<{ valid: boolean; reason?: string }> {
        return RpaPageHelpers.validatePage(page, options);
    }

    /**
     * 功能描述：通用异步重试包装器
     *
     * 参数说明：
     * - fn: [() => Promise<T>] 需要重试的异步函数
     * - options: [object] 重试配置
     */
    public static async withRetry<T>(
        fn: () => Promise<T>,
        options: {
            maxAttempts?: number;
            delayMs?: number;
            onRetry?: (err: any, attempt: number) => void;
        } = {}
    ): Promise<T> {
        return RpaPageHelpers.withRetry(fn, options);
    }
}
