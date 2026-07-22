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
import type { IBrowserDriver, GetPageOptions, AuthenticatedPage } from './interfaces/IBrowserDriver.js';
import { PlaywrightDriver } from './drivers/PlaywrightDriver.js';
import { CamoufoxDriver } from './drivers/CamoufoxDriver.js';

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
    ): Promise<{ browser: any; context: any; page: any }> {
        const result = await this.driver.getAuthenticatedPage({
            purpose: type,
            headless,
            accountId,
        });
        // Original API exposed { browser, context, page } — keep that for compat.
        // Note: 'browser' is now the same handle as 'context' for Playwright persistent
        // contexts, which matches the pre-refactor behavior.
        return {
            browser: result.context,
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
}
