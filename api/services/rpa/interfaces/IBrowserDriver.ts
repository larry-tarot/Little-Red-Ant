/**
 * Browser Driver 抽象 —— Sprint 4 引入。
 *
 * 背景:RPA 反检测是项目的最大长期风险。当前 BrowserService 直接绑死
 * Playwright + stealth 插件;未来若需要切换到 Camoufox (Firefox 内核,
 * 原生抗指纹) 或其他浏览器,会引发大范围改动。
 *
 * 设计:把"启动浏览器 + 创建带 Cookie 的 Page"抽象为 IBrowserDriver。
 * 现有 BrowserService 的逻辑迁移到 PlaywrightDriver。新代码统一通过
 * BrowserService.createDriver() 拿 driver,不知道底层是哪个实现。
 *
 * Sprint 4 状态:
 *   - PlaywrightDriver:默认,完整迁移现有 BrowserService
 *   - CamoufoxDriver:仅占位,实际启用需要先验证 camoufox-js 在 npm 上可用
 *     (Sprint 4 完成时,此 driver 在 driverName 之外不暴露 UI 选项)
 */

import type { Browser, BrowserContext, Page } from 'playwright';

export type BrowserPurpose = 'CREATOR' | 'MAIN_SITE' | 'ANONYMOUS';

export interface AuthenticatedPage {
    /**
     * Underlying browser instance.
     * For ANONYMOUS ephemeral contexts this is the owning browser process
     * and must be closed to avoid leaking Chrome instances.
     * For persistent profiles the browser is managed by the driver.
     */
    browser?: Browser;
    /** Persistent context — caller should NOT close unless intentional. */
    context: BrowserContext;
    page: Page;
    /** Identifier for logging / debugging. */
    profileName: string;
}

export interface GetPageOptions {
    purpose: BrowserPurpose;
    headless?: boolean;
    /** When undefined, picks the active account from DB. */
    accountId?: number;
}

export interface IBrowserDriver {
    /** Driver identifier; surfaced in logs and the future health check. */
    readonly driverName: string;

    /** Acquire a persistent-context + fresh Page. Reuses context if already open. */
    getAuthenticatedPage(opts: GetPageOptions): Promise<AuthenticatedPage>;

    /** Force-close all contexts. Called on graceful shutdown. */
    closeAll(): Promise<void>;
}
