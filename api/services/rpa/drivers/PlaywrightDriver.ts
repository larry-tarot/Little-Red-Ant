/**
 * PlaywrightDriver —— 默认 RPA Driver。
 * 把原 BrowserService 的大部分逻辑搬过来,实现 IBrowserDriver。
 *
 * 行为:与原 BrowserService 100% 一致,确保 Sprint 4 是"零行为变化"的纯重构。
 */

import { chromium } from 'playwright-extra';
import { BrowserContext, Page } from 'playwright';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import { Logger } from '../../LoggerService.js';
import { getCookies } from '../auth.js';
import db from '../../../db.js';
import type { IBrowserDriver, GetPageOptions, AuthenticatedPage, BrowserPurpose } from '../interfaces/IBrowserDriver.js';

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

    public async getAuthenticatedPage(opts: GetPageOptions): Promise<AuthenticatedPage> {
        const { purpose, headless = true, accountId } = opts;

        // Resolve target account
        let targetAccountId: number | undefined = typeof accountId === 'number' ? accountId : undefined;
        if (!targetAccountId && purpose !== 'ANONYMOUS') {
            const activeAccount = db.prepare('SELECT id FROM accounts WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined;
            if (activeAccount) targetAccountId = activeAccount.id;
        }

        const profileName = purpose === 'ANONYMOUS' ? 'anonymous_profile' : `account_${targetAccountId || 'default'}`;
        const userDataDir = path.join(USER_DATA_DIR, profileName);

        // Reuse active context
        if (this.activeProfiles.has(profileName)) {
            const entry = this.activeProfiles.get(profileName)!;
            try {
                const page = await entry.context.newPage();
                return { context: entry.context, page, profileName };
            } catch {
                this.activeProfiles.delete(profileName);
            }
        }

        // Wait for lock
        while (this.profileLocks.has(profileName)) {
            Logger.info('BrowserService', `Waiting for profile lock: ${profileName}...`);
            await new Promise((r) => setTimeout(r, 1000));
            if (this.activeProfiles.has(profileName)) {
                const entry = this.activeProfiles.get(profileName)!;
                const page = await entry.context.newPage();
                return { context: entry.context, page, profileName };
            }
        }

        // Acquire lock
        let releaseLock: () => void;
        const lockPromise = new Promise<void>((resolve) => { releaseLock = resolve; });
        this.profileLocks.set(profileName, lockPromise);

        try {
            if (!fs.existsSync(userDataDir)) {
                fs.mkdirSync(userDataDir, { recursive: true });
            }

            Logger.info('BrowserService', `Launching Persistent Context for ${profileName} in ${userDataDir}`);

            const context = await chromium.launchPersistentContext(userDataDir, {
                headless,
                channel: 'chrome',
                viewport: { width: 1280, height: 800 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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

            this.activeProfiles.set(profileName, { context, lastUsed: Date.now() });
            context.on('close', () => {
                this.activeProfiles.delete(profileName);
                Logger.info('BrowserService', `Profile ${profileName} closed/disconnected.`);
            });

            if (purpose !== 'ANONYMOUS') {
                const storageState = getCookies(purpose, targetAccountId);
                if (storageState) {
                    const cookies = Array.isArray(storageState) ? storageState : (storageState as any).cookies;
                    if (Array.isArray(cookies)) {
                        await context.addCookies(cookies);
                        Logger.info('BrowserService', 'Refreshed cookies from DB into Persistent Context');
                    }
                }
            }

            const page = await context.newPage();
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });

            return { context, page, profileName };
        } finally {
            this.profileLocks.delete(profileName);
            if (releaseLock!) releaseLock();
        }
    }

    public async closeAll(): Promise<void> {
        Logger.info('BrowserService', `Closing ${this.activeProfiles.size} active browser contexts...`);
        for (const [id, entry] of this.activeProfiles.entries()) {
            try {
                await entry.context.close();
                Logger.info('BrowserService', `Closed persistent profile ${id}`);
            } catch (e) {
                Logger.error('BrowserService', `Failed to close profile ${id}`, e);
            }
        }
        this.activeProfiles.clear();
    }
}
