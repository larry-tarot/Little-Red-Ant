/**
 * PlaywrightDriver —— 默认 RPA Driver。
 * 把原 BrowserService 的大部分逻辑搬过来，实现 IBrowserDriver。
 *
 * 改造要点：
 *   1. 保留 userDataDir，不再每次启动时删除。
 *      小红书登录态依赖浏览器本地持久化 Cookie / localStorage，
 *      频繁重建 userDataDir 会导致 Cookie 丢失、环境指纹变化，
 *      从而触发平台重新要求登录。
 *   2. 已认证的 persistent context 优先复用，减少进程/窗口重启。
 *   3. 每次拿 Page 时优先用当前上下文已有 Cookie 做心跳校验；
 *      校验失败再注入数据库中的 Cookie 作为兜底。
 *   4. 校验通过后把浏览器最新的 storageState 回写到数据库，
 *      保证 DB 中的 Cookie 始终接近平台最新状态，降低“很快过期”的概率。
 */

import { chromium } from 'playwright-extra';
import { Browser, BrowserContext } from 'playwright';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import { Logger } from '../../LoggerService.js';
import { getCookies } from '../auth.js';
import { EncryptionService } from '../../core/EncryptionService.js';
import db from '../../../db.js';
import type { IBrowserDriver, GetPageOptions, AuthenticatedPage } from '../interfaces/IBrowserDriver.js';

chromium.use(stealthPlugin());

const USER_DATA_DIR = path.join(process.cwd(), 'browser_data');

interface ContextEntry {
    context: BrowserContext;
    lastUsed: number;
}

export class PlaywrightDriver implements IBrowserDriver {
    public readonly driverName = 'playwright';

    private activeProfiles: Map<string, ContextEntry> = new Map();
    private profileLocks: Map<string, Promise<any>> = new Map();
    /**
     * Track ephemeral anonymous browser instances so closeAll() can shut them
     * down and avoid leaking Chrome processes.
     */
    private anonymousBrowsers: Set<Browser> = new Set();

    /**
     * 功能描述：获取已认证的浏览器页面
     *
     * 参数说明：
     * - opts.purpose: 'CREATOR' | 'MAIN_SITE' | 'ANONYMOUS'
     * - opts.headless: boolean 是否无头模式，默认 true
     * - opts.accountId: number 可选账号 ID，未指定时使用当前激活账号
     *
     * 返回说明：
     * - AuthenticatedPage 包含 context / page / profileName
     *
     * 异常情况：
     * - NO_ACTIVE_ACCOUNT: 没有激活账号
     * - COOKIE_EXPIRED: Cookie 已失效，需要重新扫码授权
     */
    public async getAuthenticatedPage(opts: GetPageOptions): Promise<AuthenticatedPage> {
        const { purpose, headless = true, accountId } = opts;

        // 解析目标账号 ID
        let targetAccountId: number | undefined =
            typeof accountId === 'number' ? accountId : undefined;
        if (!targetAccountId && purpose !== 'ANONYMOUS') {
            const activeAccount = db
                .prepare('SELECT id FROM accounts WHERE is_active = 1 LIMIT 1')
                .get() as { id: number } | undefined;
            if (activeAccount) targetAccountId = activeAccount.id;
        }

        const profileName =
            purpose === 'ANONYMOUS'
                ? 'anonymous_profile'
                : `account_${targetAccountId || 'default'}`;
        const userDataDir = path.join(USER_DATA_DIR, profileName);

        // 匿名会话保持独立 ephemeral，不参与持久化 profile 复用
        if (purpose === 'ANONYMOUS') {
            return this.launchAnonymous(headless, profileName);
        }

        // 已认证会话需要串行化，避免多个任务同时清除/注入 Cookie
        const releaseLock = await this.acquireProfileLock(profileName);

        try {
            let context = this.getHealthyContext(profileName);

            // 如果内存中没有可用 context，则启动 persistent context
            if (!context) {
                context = await this.launchPersistentContext(
                    profileName,
                    userDataDir,
                    headless
                );
            }

            const page = await context.newPage();
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'zh-CN,zh;q=0.9',
            });

            // 第一次心跳：优先信任当前上下文中的 Cookie（磁盘恢复或上次保留）
            let sessionValid = await this.validateSession(
                page,
                purpose,
                profileName
            );

            // 如果当前 Cookie 无效，回退到数据库中的 Cookie 重新注入
            if (!sessionValid) {
                Logger.warn(
                    'BrowserService',
                    `Live cookies invalid for ${profileName}, falling back to DB cookies`
                );
                await this.refreshCookiesFromDb(
                    context,
                    purpose,
                    targetAccountId
                );
                sessionValid = await this.validateSession(
                    page,
                    purpose,
                    profileName
                );
            }

            if (!sessionValid) {
                throw new Error(
                    'COOKIE_EXPIRED: Login session expired, please re-authorize in Account Matrix'
                );
            }

            // 心跳通过后，把浏览器最新状态持久化回数据库
            await this.persistCookiesToDb(context, purpose, targetAccountId);

            const entry = this.activeProfiles.get(profileName);
            if (entry) entry.lastUsed = Date.now();

            return { context, page, profileName };
        } finally {
            releaseLock();
        }
    }

    /**
     * 功能描述：获取内存中健康且未关闭的 persistent context
     */
    private getHealthyContext(profileName: string): BrowserContext | undefined {
        const entry = this.activeProfiles.get(profileName);
        if (!entry) return undefined;

        try {
            // 轻量健康检查：能拿到 pages() 说明 context 还活着
            entry.context.pages();
            return entry.context;
        } catch {
            this.activeProfiles.delete(profileName);
            return undefined;
        }
    }

    /**
     * 功能描述：启动一个持久化的浏览器上下文
     *
     * 设计思路：
     * - 保留已有的 userDataDir，让 Chrome 从磁盘恢复 Cookie / localStorage。
     * - 如果目录不存在则新建，避免首次启动失败。
     */
    private async launchPersistentContext(
        profileName: string,
        userDataDir: string,
        headless: boolean
    ): Promise<BrowserContext> {
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
            Logger.info(
                'BrowserService',
                `Created new userDataDir for ${profileName}`
            );
        } else {
            Logger.info(
                'BrowserService',
                `Reusing existing userDataDir for ${profileName}`
            );
        }

        Logger.info(
            'BrowserService',
            `Launching Persistent Context for ${profileName} in ${userDataDir}`
        );

        const context = await chromium.launchPersistentContext(userDataDir, {
            headless,
            channel: 'chrome',
            viewport: { width: 1280, height: 800 },
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
            geolocation: { longitude: 121.4737, latitude: 31.2304 },
            deviceScaleFactor: 1,
            hasTouch: false,
            isMobile: false,
            javaScriptEnabled: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,800',
                '--restore-last-session=false',
                '--no-first-run',
                '--no-default-browser-check',
                '--hide-crash-restore-bubble',
            ],
        });

        this.activeProfiles.set(profileName, {
            context,
            lastUsed: Date.now(),
        });

        context.on('close', () => {
            this.activeProfiles.delete(profileName);
            Logger.info(
                'BrowserService',
                `Profile ${profileName} closed/disconnected.`
            );
        });

        return context;
    }

    /**
     * 功能描述：启动一个临时的匿名浏览器上下文
     */
    private async launchAnonymous(
        headless: boolean,
        profileName: string
    ): Promise<AuthenticatedPage> {
        Logger.info('BrowserService', 'Launching ephemeral anonymous browser context');

        const browser = await chromium.launch({
            headless,
            channel: 'chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,800',
                '--no-first-run',
                '--no-default-browser-check',
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
            geolocation: { longitude: 121.4737, latitude: 31.2304 },
            deviceScaleFactor: 1,
            hasTouch: false,
            isMobile: false,
            javaScriptEnabled: true,
        });

        this.anonymousBrowsers.add(browser);

        context.on('close', () => {
            this.anonymousBrowsers.delete(browser);
            browser.close().catch((e) => {
                Logger.warn(
                    'BrowserService',
                    `Failed to close anonymous browser: ${(e as Error).message}`
                );
            });
        });

        const page = await context.newPage();
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });
        return { browser, context, page, profileName };
    }

    /**
     * 功能描述：对指定 profile 加锁，防止并发修改 Cookie
     *
     * 返回说明：
     * - releaseLock 释放锁的回调函数
     */
    private async acquireProfileLock(profileName: string): Promise<() => void> {
        while (this.profileLocks.has(profileName)) {
            Logger.info(
                'BrowserService',
                `Waiting for profile lock: ${profileName}...`
            );
            try {
                await this.profileLocks.get(profileName);
            } catch {
                // 前一个持有方异常不影响当前请求
            }
        }

        let releaseLock: () => void = () => {};
        const lockPromise = new Promise<void>((resolve) => {
            releaseLock = () => {
                this.profileLocks.delete(profileName);
                resolve();
            };
        });
        this.profileLocks.set(profileName, lockPromise);

        return releaseLock;
    }

    /**
     * 功能描述：从数据库读取 Cookie 并注入到指定上下文
     *
     * 参数说明：
     * - context: BrowserContext 目标上下文
     * - purpose: 'CREATOR' | 'MAIN_SITE' 决定读取哪种 Cookie
     * - accountId: number | undefined 账号 ID
     */
    private async refreshCookiesFromDb(
        context: BrowserContext,
        purpose: 'CREATOR' | 'MAIN_SITE',
        accountId?: number
    ): Promise<void> {
        const storageState = getCookies(purpose, accountId);
        if (!storageState) {
            Logger.warn(
                'BrowserService',
                `No ${purpose} cookies found in DB for account ${accountId || 'active'}`
            );
            return;
        }

        const cookies = Array.isArray(storageState)
            ? storageState
            : (storageState as any).cookies;
        if (!Array.isArray(cookies)) {
            Logger.warn('BrowserService', 'DB cookies format invalid');
            return;
        }

        try {
            await context.clearCookies();
            Logger.info('BrowserService', 'Cleared stale cookies from context');
        } catch (e: any) {
            Logger.warn(
                'BrowserService',
                `Failed to clear cookies: ${e.message}`
            );
        }

        try {
            await context.addCookies(cookies);
            Logger.info(
                'BrowserService',
                `Injected ${cookies.length} ${purpose} cookies from DB`
            );
        } catch (e: any) {
            Logger.warn(
                'BrowserService',
                `Failed to inject cookies: ${e.message}`
            );
        }
    }

    /**
     * 功能描述：登录态心跳校验
     *
     * 设计思路：
     * 访问平台首页，检查 URL 是否被重定向到登录页，或页面是否出现登录提示。
     * 返回 boolean，不抛异常，避免网络抖动导致任务被误判为 Cookie 过期。
     *
     * 参数说明：
     * - page: Page 页面实例
     * - purpose: 'CREATOR' | 'MAIN_SITE' | 'ANONYMOUS'
     * - profileName: string 用于日志标识
     *
     * 返回说明：
     * - true 表示当前 Cookie 仍有效；false 表示需要重新注入或已过期
     */
    private async validateSession(
        page: any,
        purpose: 'CREATOR' | 'MAIN_SITE' | 'ANONYMOUS',
        profileName: string
    ): Promise<boolean> {
        if (purpose === 'ANONYMOUS') return true;

        const heartbeatUrl =
            purpose === 'CREATOR'
                ? 'https://creator.xiaohongshu.com/creator/home'
                : 'https://www.xiaohongshu.com';

        try {
            await page.goto(heartbeatUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
            await page.waitForTimeout(2000);

            const url = page.url();
            const isLoginUrl =
                url.includes('/login') || url.includes('/sign');

            const isLoggedOut = await page.evaluate(() => {
                const pageText = document.body
                    ? document.body.innerText
                    : '';
                const hasPhoneInput = !!document.querySelector(
                    'input[placeholder*="手机号"], input[placeholder*="电话"]'
                );
                const hasLoginText =
                    pageText.includes('手机号登录') ||
                    pageText.includes('验证码登录') ||
                    pageText.includes('密码登录');
                return hasPhoneInput || hasLoginText;
            });

            if (isLoginUrl || isLoggedOut) {
                Logger.warn(
                    'BrowserService',
                    `Session heartbeat failed for ${profileName}: redirected to login (${url})`
                );
                return false;
            }

            Logger.info(
                'BrowserService',
                `Session heartbeat OK for ${profileName}`
            );
            return true;
        } catch (e: any) {
            Logger.warn(
                'BrowserService',
                `Session heartbeat error for ${profileName}: ${e.message}`
            );
            return false;
        }
    }

    /**
     * 功能描述：把浏览器当前 storageState 回写到数据库
     *
     * 设计思路：
     * 平台在浏览过程中会刷新 session token，只依赖登录时保存的 Cookie
     * 会导致“很快过期”。通过每次校验成功后回写，可以让数据库中的 Cookie
     * 保持最新，下次启动时即使磁盘丢失也能从 DB 恢复有效状态。
     *
     * 参数说明：
     * - context: BrowserContext 当前上下文
     * - purpose: 'CREATOR' | 'MAIN_SITE' 决定写回哪一列
     * - accountId: number | undefined 账号 ID
     */
    private async persistCookiesToDb(
        context: BrowserContext,
        purpose: 'CREATOR' | 'MAIN_SITE',
        accountId?: number
    ): Promise<void> {
        try {
            const storageState = await context.storageState();
            const cookies = (storageState as any).cookies;
            if (!Array.isArray(cookies) || cookies.length === 0) {
                Logger.warn(
                    'BrowserService',
                    `No cookies to persist for ${purpose}`
                );
                return;
            }
            if (!cookies.some((c: any) => c.name && c.value)) {
                Logger.warn(
                    'BrowserService',
                    `Session cookies empty, skip persistence for ${purpose}`
                );
                return;
            }

            const targetId =
                accountId ??
                (
                    db
                        .prepare(
                            'SELECT id FROM accounts WHERE is_active = 1 LIMIT 1'
                        )
                        .get() as { id: number } | undefined
                )?.id;
            if (!targetId) {
                Logger.warn('BrowserService', 'No account to persist cookies');
                return;
            }

            const column =
                purpose === 'CREATOR' ? 'creator_cookies' : 'main_site_cookies';
            const encrypted = EncryptionService.encrypt(
                JSON.stringify(storageState)
            );

            db.prepare(
                `UPDATE accounts SET ${column} = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).run(encrypted, targetId);

            Logger.info(
                'BrowserService',
                `Persisted ${purpose} cookies to DB for account ${targetId}`
            );
        } catch (e: any) {
            Logger.warn(
                'BrowserService',
                `Failed to persist cookies: ${e.message}`
            );
        }
    }

    public async closeAll(): Promise<void> {
        Logger.info(
            'BrowserService',
            `Closing ${this.activeProfiles.size} active browser contexts and ${this.anonymousBrowsers.size} anonymous browsers...`
        );

        // Close persistent authenticated profiles.
        for (const [id, entry] of this.activeProfiles.entries()) {
            try {
                await entry.context.close();
                Logger.info('BrowserService', `Closed persistent profile ${id}`);
            } catch (e) {
                Logger.error(
                    'BrowserService',
                    `Failed to close profile ${id}`,
                    e
                );
            }
        }
        this.activeProfiles.clear();

        // Close ephemeral anonymous browsers to prevent process leaks.
        for (const browser of this.anonymousBrowsers) {
            try {
                await browser.close();
                Logger.info('BrowserService', 'Closed anonymous browser');
            } catch (e) {
                Logger.error(
                    'BrowserService',
                    'Failed to close anonymous browser',
                    e
                );
            }
        }
        this.anonymousBrowsers.clear();
    }
}
