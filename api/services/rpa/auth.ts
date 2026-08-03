
import { Browser } from 'playwright';
import db from '../../db.js';
import { launchBrowser, createBrowserContext } from './utils.js';
import { Logger } from '../LoggerService.js';
import axios from 'axios';
import { Selectors } from './config/selectors.js';
import { EncryptionService } from '../core/EncryptionService.js';
import { AccountService } from '../core/AccountService.js';
import { BrowserService } from './BrowserService.js';
import fs from 'fs';
import path from 'path';

// Login State Management
let loginState: {
  status: 'IDLE' | 'WAITING_FOR_SCAN' | 'SUCCESS' | 'FAILED';
  type?: 'CREATOR' | 'MAIN_SITE';
  message?: string;
  qrCodeUrl?: string;
  page?: any;
  context?: any;
  browser?: Browser | null;
  lastQrRefreshAt?: number;
} = { status: 'IDLE' };

export function getLoginState() {
  return loginState;
}

/**
 * 功能描述：重置登录状态并清理浏览器引用
 *
 * 设计思路：
 * 登录流程结束（成功/失败/取消）时，必须释放 Playwright 页面/上下文/浏览器引用，
 * 避免内存泄漏和进程残留。
 */
async function resetLoginState(
  status: 'IDLE' | 'SUCCESS' | 'FAILED',
  message?: string
): Promise<void> {
  const { page, context, browser } = loginState;

  loginState = { status, message };

  if (page) {
    try {
      await page.close();
    } catch (_e) {
      /* ignore */
    }
  }
  if (context) {
    try {
      await context.close();
    } catch (_e) {
      /* ignore */
    }
  }
  if (browser) {
    try {
      await browser.close();
    } catch (_e) {
      /* ignore */
    }
  }
}

/**
 * 功能描述：刷新当前登录流程的二维码
 *
 * 设计思路：
 * 小红书二维码有效期约 5 分钟，用户可能因扫码超时而需要刷新。
 * 刷新时复用当前登录页面，重新加载并截图，避免重启整个浏览器流程。
 * 增加 3 秒刷新冷却，防止用户/前端疯狂点击。
 *
 * 返回说明：
 * - { success: boolean; qrCodeUrl?: string; message?: string }
 */
export async function refreshQrCode(): Promise<{
  success: boolean;
  qrCodeUrl?: string;
  message?: string;
}> {
  if (loginState.status !== 'WAITING_FOR_SCAN') {
    return { success: false, message: '当前不在扫码流程中' };
  }

  const now = Date.now();
  if (loginState.lastQrRefreshAt && now - loginState.lastQrRefreshAt < 3000) {
    return { success: false, message: '刷新太频繁，请稍后再试', qrCodeUrl: loginState.qrCodeUrl };
  }

  const { page, type } = loginState;
  if (!page) {
    return { success: false, message: '登录页面已丢失，请重新发起登录' };
  }

  try {
    loginState.lastQrRefreshAt = now;

    // 重新加载登录页以获取新二维码
    const loginUrl =
      type === 'CREATOR'
        ? 'https://creator.xiaohongshu.com/publish/publish'
        : 'https://www.xiaohongshu.com';

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const prefix = type === 'CREATOR' ? 'creator-login' : 'main-site-login';
    const newQrCodeUrl = await captureQrCode(page, prefix);

    if (newQrCodeUrl) {
      loginState.qrCodeUrl = newQrCodeUrl;
      Logger.info('Auth', `QR code refreshed: ${newQrCodeUrl}`);
      return { success: true, qrCodeUrl: newQrCodeUrl };
    }

    return { success: false, message: '刷新二维码截图失败，请重试', qrCodeUrl: loginState.qrCodeUrl };
  } catch (e: any) {
    Logger.error('Auth', `Failed to refresh QR code: ${e.message}`);
    return { success: false, message: `刷新失败: ${e.message}`, qrCodeUrl: loginState.qrCodeUrl };
  }
}

/**
 * 功能描述：截取登录页面二维码并生成前端可访问的 URL
 *
 * 参数说明：
 * - page: Page Playwright 页面实例
 * - prefix: string 文件名前缀，用于区分创作者/主站登录
 *
 * 返回说明：
 * - string | undefined 二维码图片的相对 URL，截图失败时返回 undefined
 */
async function captureQrCode(page: any, prefix: string): Promise<string | undefined> {
    try {
        const qrDir = path.join(process.cwd(), 'public', 'qr-codes');
        if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
        const qrPath = path.join(qrDir, `${prefix}-${Date.now()}.png`);
        await page.waitForTimeout(2000);
        await page.screenshot({ path: qrPath, fullPage: true });
        const url = `/qr-codes/${path.basename(qrPath)}`;
        Logger.info('Auth', `Captured QR code for ${prefix}: ${url}`);
        return url;
    } catch (e: any) {
        Logger.warn('Auth', `Failed to capture QR screenshot for ${prefix}: ${e.message}`);
        return undefined;
    }
}

/**
 * 功能描述：检测小红书主站登录状态
 *
 * 设计思路：
 * 小红书网页版登录态判断不能依赖单一选择器，需结合 URL、DOM 和 Cookie 综合判断，
 * 避免页面跳转间隙误判为未登录。
 */
async function detectMainSiteLogin(page: any): Promise<boolean> {
    return BrowserService.verifyLoginState(page, 'MAIN_SITE');
}

/**
 * 功能描述：检测小红书创作服务平台登录状态
 */
async function detectCreatorLogin(page: any): Promise<boolean> {
    return BrowserService.verifyLoginState(page, 'CREATOR');
}

/**
 * 功能描述：验证 Playwright storageState 中是否包含有效登录 Cookie
 *
 * 参数说明：
 * - storageState: any Playwright 导出的 storageState 对象
 *
 * 返回说明：
 * - boolean true 表示包含非空 cookie 数组
 */
function hasValidSessionCookies(storageState: any): boolean {
    if (!storageState) return false;
    const cookies = storageState.cookies;
    return Array.isArray(cookies) && cookies.length > 0 && cookies.some((c: any) => c.name && c.value);
}

/**
 * 功能描述：判断浏览器上下文是否包含小红书主站认证 Cookie
 *
 * 设计思路：
 * 小红书主站登录态除了通过 DOM 判断外，还可以通过关键 Cookie 是否存在来确认。
 * 当页面未刷新或 DOM 选择器失效时，Cookie 检测可以作为兜底手段。
 *
 * 参数说明：
 * - cookies: any[] Playwright 导出的 cookie 数组
 *
 * 返回说明：
 * - boolean true 表示存在主站认证相关 Cookie
 */
function hasMainSiteAuthCookies(cookies: any[]): boolean {
    if (!Array.isArray(cookies) || cookies.length === 0) return false;
    // 只有真正的会话/认证 Cookie 才能证明已登录；
    // webId/a1/gid 等是访客标识，未登录时也会存在，不能作为登录依据。
    const authCookieNames = ['web_session', 'websectoken'];
    return cookies.some((cookie) => authCookieNames.includes(cookie.name) && !!cookie.value);
}

/**
 * 功能描述：校验是否存在已激活的账号，并具备指定类型的有效 Cookie
 *
 * 设计思路：
 * 小红书网页版操作（浏览/发布/评论等）均依赖登录态，失败时统一抛出 NO_ACTIVE_ACCOUNT 或
 * COOKIE_EXPIRED 错误，方便上层转换为友好的用户提示。
 *
 * 参数说明：
 * - type: 'CREATOR' | 'MAIN_SITE' | 'ANY' 需要校验的 Cookie 类型
 *   - CREATOR: 必须有 creator_cookies 或 legacy cookies
 *   - MAIN_SITE: 必须有 main_site_cookies，或创作中心 Cookie（二者通常共享登录态）
 *   - ANY: 只要有一种有效 Cookie 即可
 *
 * 返回说明：
 * - { id: number } 活跃账号的 ID
 *
 * 异常情况：
 * - NO_ACTIVE_ACCOUNT: 没有激活账号
 * - COOKIE_EXPIRED: 激活账号缺少指定类型的 Cookie
 */
export function requireActiveAccount(type: 'CREATOR' | 'MAIN_SITE' | 'ANY' = 'ANY'): { id: number } {
    const activeAccount = db.prepare(
        'SELECT id, creator_cookies, main_site_cookies, cookies FROM accounts WHERE is_active = 1 LIMIT 1'
    ).get() as { id: number; creator_cookies?: string; main_site_cookies?: string; cookies?: string } | undefined;

    if (!activeAccount) {
        throw new Error('NO_ACTIVE_ACCOUNT: Please bind a Xiaohongshu account in Account Matrix first');
    }

    let hasCookie = false;
    if (type === 'CREATOR') {
        // 创作平台权限只认 creator_cookies（或历史 cookies 字段）
        hasCookie = !!(activeAccount.creator_cookies || activeAccount.cookies);
    } else if (type === 'MAIN_SITE') {
        // 主站浏览权限必须严格匹配主站 Cookie，禁止用创作者 Cookie 回退，
        // 避免把发布权限误判为可预览权限。
        hasCookie = !!activeAccount.main_site_cookies;
    } else {
        // ANY: 任意一种有效 Cookie 即可
        hasCookie = !!(activeAccount.creator_cookies || activeAccount.main_site_cookies || activeAccount.cookies);
    }

    if (!hasCookie) {
        throw new Error('COOKIE_EXPIRED: Account cookies missing, please re-authorize in Account Matrix');
    }

    return { id: activeAccount.id };
}

/**
 * 功能描述：校验指定账号是否存在且具备指定类型的有效 Cookie
 *
 * 参数说明：
 * - accountId: number 账号 ID
 * - type: 'CREATOR' | 'MAIN_SITE' | 'ANY' 需要校验的 Cookie 类型
 *
 * 返回说明：
 * - void 校验通过时无返回值
 *
 * 异常情况：
 * - NO_ACTIVE_ACCOUNT: 账号不存在
 * - COOKIE_EXPIRED: 该账号缺少指定类型的 Cookie
 */
export function requireAccountCookie(accountId: number, type: 'CREATOR' | 'MAIN_SITE' | 'ANY' = 'ANY'): void {
    const account = db.prepare(
        'SELECT creator_cookies, main_site_cookies, cookies FROM accounts WHERE id = ?'
    ).get(accountId) as { creator_cookies?: string; main_site_cookies?: string; cookies?: string } | undefined;

    if (!account) {
        throw new Error(`NO_ACTIVE_ACCOUNT: Account ${accountId} not found`);
    }

    let hasCookie = false;
    if (type === 'CREATOR') {
        hasCookie = !!(account.creator_cookies || account.cookies);
    } else if (type === 'MAIN_SITE') {
        // 主站浏览权限严格只认 main_site_cookies
        hasCookie = !!account.main_site_cookies;
    } else {
        hasCookie = !!(account.creator_cookies || account.main_site_cookies || account.cookies);
    }

    if (!hasCookie) {
        throw new Error(`COOKIE_EXPIRED: Account ${accountId} cookies missing, please re-authorize in Account Matrix`);
    }
}

/**
 * 功能描述：判断页面是否被反爬拦截
 */
async function detectAntiBot(page: any): Promise<{ blocked: boolean; reason?: string }> {
    return BrowserService.detectAntiBot(page);
}

/**
 * 功能描述：使用浏览器验证创作者平台 Cookie 是否有效
 *
 * 设计思路：
 * 健康检查不能因一次网络抖动或 DOM 选择器失效就误删有效 Cookie。
 * 这里采用"重试 3 次 + 区分明确过期与疑似异常"的策略：
 * - 明确过期：页面被重定向到登录页
 * - 疑似异常：超时、选择器未匹配、反爬拦截等，继续重试，不删 Cookie
 */
async function verifyCreatorWithBrowser(
    session: { context?: any; page?: any },
    account: { id: number; nickname?: string }
): Promise<boolean> {
    const { page } = session;
    if (!page) {
        Logger.warn('Auth', `Cannot verify creator: page missing for account ${account.nickname || account.id}`);
        return true;
    }
    let lastReason = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.goto('https://creator.xiaohongshu.com/creator/home', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
            await page.waitForTimeout(3000);

            const antiBot = await detectAntiBot(page);
            if (antiBot.blocked) {
                lastReason = `被拦截: ${antiBot.reason}`;
                Logger.warn('Auth', `Creator health check attempt ${attempt} blocked: ${antiBot.reason}`);
                continue;
            }

            const url = page.url();
            if (url.includes('/login')) {
                Logger.warn('Auth', `Creator Cookie definitely expired (redirected to login): ${account.nickname || account.id}`);
                return false;
            }

            const isLoggedIn = await page.evaluate((selectors: any) => {
                return !!document.querySelector(selectors.Common.Login.LoggedInIndicators.Creator);
            }, Selectors);

            if (isLoggedIn) {
                return true;
            }

            lastReason = '未找到登录态 DOM 指示器';
            Logger.warn('Auth', `Creator health check attempt ${attempt} DOM indicator missing`);
        } catch (e: any) {
            lastReason = e.message;
            Logger.warn('Auth', `Creator health check attempt ${attempt} error: ${e.message}`);
        }
    }

    Logger.warn('Auth', `Creator Cookie suspicious after retries (${lastReason}): ${account.nickname || account.id}`);
    // 重试后仍无法确认登录态，保守起见不清除，让下次任务触发时再验证
    return true;
}

/**
 * 功能描述：使用浏览器验证主站 Cookie 是否有效
 *
 * 设计思路：
 * 主站验证以首页可访问性为准（而非个人主页），避免 user_id 缺失/受限导致误判。
 * 同样采用重试策略，只有明确被重定向到登录页才判定过期。
 */
async function verifyMainSiteWithBrowser(
    session: { context?: any; page?: any },
    account: { id: number; nickname?: string }
): Promise<boolean> {
    const { page, context } = session;
    if (!page || !context) {
        Logger.warn('Auth', `Cannot verify main site: page/context missing for account ${account.nickname || account.id}`);
        return true;
    }
    let lastReason = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.goto('https://www.xiaohongshu.com', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
            await page.waitForTimeout(3000);

            const antiBot = await detectAntiBot(page);
            if (antiBot.blocked) {
                lastReason = `被拦截: ${antiBot.reason}`;
                Logger.warn('Auth', `Main site health check attempt ${attempt} blocked: ${antiBot.reason}`);
                continue;
            }

            const url = page.url();
            const isLoginRedirect = url.includes('/login') || url.includes('redirectPath');

            if (isLoginRedirect) {
                Logger.warn('Auth', `Main Site Cookie definitely expired (redirected to login): ${account.nickname || account.id}`);
                return false;
            }

            // 首页未触发登录重定向，且存在主站认证 Cookie，即认为有效
            const cookieLogin = hasMainSiteAuthCookies(await context.cookies());
            if (cookieLogin) {
                return true;
            }

            lastReason = '缺少主站认证 Cookie';
            Logger.warn('Auth', `Main site health check attempt ${attempt} missing auth cookies`);
        } catch (e: any) {
            lastReason = e.message;
            Logger.warn('Auth', `Main site health check attempt ${attempt} error: ${e.message}`);
        }
    }

    Logger.warn('Auth', `Main Site Cookie suspicious after retries (${lastReason}): ${account.nickname || account.id}`);
    return true;
}

/**
 * 功能描述：轻量 HTTP 验证主站 Cookie 是否有效
 *
 * 设计思路：
 * 通过 axios 访问首页并禁止跟随重定向，若服务器返回 302/301 到登录页则判定过期。
 * 相比启动浏览器更轻量、更快、更不容易因页面渲染问题误判。
 */
async function verifyMainSiteWithRequest(accountId?: number): Promise<boolean> {
    try {
        const cookies = getCookies('MAIN_SITE', accountId);
        if (!cookies || cookies.length === 0) return false;

        const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

        const res = await axios.get('https://www.xiaohongshu.com', {
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.xiaohongshu.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            validateStatus: (status) => status < 500,
            maxRedirects: 0,
            timeout: 15000,
        });

        // 30x 跳转到登录页说明 Cookie 已失效
        if (res.status === 301 || res.status === 302) {
            const location = res.headers['location'] || '';
            if (location.includes('/login') || location.includes('sign')) {
                console.warn(`[Auth] Main site session expired: redirect to ${location}`);
                return false;
            }
        }

        // 200 但返回登录相关 HTML，也视为失效（兜底）
        if (res.status === 200 && typeof res.data === 'string') {
            const html = res.data.toLowerCase();
            if (html.includes('手机号登录') || html.includes('验证码登录')) {
                console.warn(`[Auth] Main site session expired: login page HTML detected`);
                return false;
            }
        }

        return true;
    } catch (e: any) {
        if (e.response && (e.response.status === 301 || e.response.status === 302)) {
            console.warn(`[Auth] Main site session expired: Redirected`);
            return false;
        }
        console.warn(`[Auth] Main site session verification error: ${e.message}`);
        return false;
    }
}

/**
 * 功能描述：解析加密存储的 Cookie 字符串为 Playwright Cookie 数组
 */
function parseEncryptedCookies(encrypted: string): any[] {
    try {
        const decrypted = EncryptionService.decrypt(encrypted);
        const parsed = JSON.parse(decrypted);
        if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed.cookies;
        if (Array.isArray(parsed)) return parsed;
    } catch (_e) {
        // 解密失败时尝试直接解析（可能未加密）
        try {
            const parsed = JSON.parse(encrypted);
            if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed.cookies;
            if (Array.isArray(parsed)) return parsed;
        } catch (_e2) {
            return [];
        }
    }
    return [];
}

/**
 * 功能描述：全量账号健康检查
 *
 * 设计思路：
 * 1. 优先使用轻量 HTTP 请求判断 Cookie 是否过期，避免频繁启动浏览器。
 * 2. HTTP 判定失败时，再启动浏览器做二次确认；浏览器检查采用重试机制，
 *    只有明确被重定向到登录页才清除 Cookie，避免误清。
 * 3. 每次检查使用独立匿名浏览器会话，检查完毕后彻底关闭，防止进程泄漏。
 */
export async function checkAllAccountsHealth() {
    Logger.info('Auth', 'Starting daily account health check...');
    const accounts = AccountService.getAccountsWithCookies();

    for (const acc of accounts) {
        Logger.info('Auth', `Checking account: ${acc.nickname || acc.id}`);
        let session: { browser?: any; context?: any; page?: any } | null = null;

        try {
            // 1. Check Creator Cookies
            if (acc.creator_cookies) {
                Logger.info('Auth', `Checking Creator cookies for: ${acc.nickname || acc.id}`);

                // 1.1 轻量 HTTP 预检
                let creatorValid = await verifySessionWithRequest(acc.id);

                // 1.2 HTTP 预检失败时，再用浏览器复核（带重试）
                if (!creatorValid) {
                    Logger.warn('Auth', `Creator HTTP check failed for ${acc.nickname || acc.id}, falling back to browser check`);
                    session = await BrowserService.getInstance().getAuthenticatedPage('ANONYMOUS', true);
                    const cookies = parseEncryptedCookies(acc.creator_cookies);
                    if (cookies.length > 0) {
                        await session.context.addCookies(cookies);
                    }
                    creatorValid = await verifyCreatorWithBrowser(session, acc);
                }

                if (creatorValid) {
                    Logger.info('Auth', `Creator Cookie Valid: ${acc.nickname || acc.id}`);
                } else {
                    Logger.warn('Auth', `Creator Cookie Expired: ${acc.nickname || acc.id}`);
                    AccountService.clearCreatorCookies(acc.id);
                }
            }

            // 2. Check Main Site Cookies
            if (acc.main_site_cookies) {
                Logger.info('Auth', `Checking Main Site cookies for: ${acc.nickname || acc.id}`);

                // 2.1 轻量 HTTP 预检
                let mainSiteValid = await verifyMainSiteWithRequest(acc.id);

                // 2.2 HTTP 预检失败时，再用浏览器复核（带重试）
                if (!mainSiteValid) {
                    Logger.warn('Auth', `Main Site HTTP check failed for ${acc.nickname || acc.id}, falling back to browser check`);
                    if (!session) {
                        session = await BrowserService.getInstance().getAuthenticatedPage('ANONYMOUS', true);
                    } else {
                        await session.context.clearCookies();
                    }
                    const cookies = parseEncryptedCookies(acc.main_site_cookies);
                    if (cookies.length > 0) {
                        await session.context.addCookies(cookies);
                    }
                    mainSiteValid = await verifyMainSiteWithBrowser(session, acc);
                }

                if (mainSiteValid) {
                    Logger.info('Auth', `Main Site Cookie Valid: ${acc.nickname || acc.id}`);
                } else {
                    Logger.warn('Auth', `Main Site Cookie Expired: ${acc.nickname || acc.id}`);
                    AccountService.clearMainSiteCookies(acc.id);
                }
            }

            // 3. Update Overall Status
            const updatedAcc = db.prepare('SELECT creator_cookies, main_site_cookies FROM accounts WHERE id = ?').get(acc.id) as any;
            if (!updatedAcc.creator_cookies && !updatedAcc.main_site_cookies) {
                db.prepare("UPDATE accounts SET status = 'EXPIRED' WHERE id = ?").run(acc.id);
            } else {
                db.prepare("UPDATE accounts SET status = 'ACTIVE' WHERE id = ?").run(acc.id);
            }
        } catch (e: any) {
            Logger.error('Auth', `Health check error for ${acc.nickname || acc.id}`, e);
        } finally {
            // 健康检查每个账号都新建一个匿名浏览器会话，必须彻底关闭
            // page -> context -> browser，避免 Chrome 进程泄漏。
            if (session?.page) { try { await session.page.close(); } catch(_e) { /* ignore */ } }
            if (session?.context) { try { await session.context.close(); } catch(_e) { /* ignore */ } }
            if (session?.browser) { try { await session.browser.close(); } catch(_e) { /* ignore */ } }
        }
    }
    Logger.info('Auth', 'Daily account health check completed.');
}

// --- CREATOR LOGIN (For Publishing & Stats) ---
export async function startCreatorLogin(accountId?: number): Promise<void> {
  if (loginState.status === 'WAITING_FOR_SCAN') return;

  loginState = { status: 'WAITING_FOR_SCAN', type: 'CREATOR' };

  let browser: Browser | null = null;
  try {
    const isHeadless = process.env.HEADLESS === 'true' || (process.platform === 'linux' && !process.env.DISPLAY);
    Logger.info('Auth', `Starting creator login (headless=${isHeadless}, accountId=${accountId || 'new'})`);

    browser = await launchBrowser(isHeadless);
    const context = await createBrowserContext(browser);
    const page = await context.newPage();

    // 将页面引用存入全局状态，支持二维码刷新和后续清理
    loginState.page = page;
    loginState.context = context;
    loginState.browser = browser;

    Logger.info('Auth', 'Navigating to Xiaohongshu Creator Center login...');
    await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded' });

    // 无论是否 headless 都尝试截图二维码：桌面版弹窗可能被遮挡，前端展示二维码更可靠
    loginState.qrCodeUrl = await captureQrCode(page, 'creator-login');

    // Check loop: 5 minutes
    for (let i = 0; i < 150; i++) {
      if (loginState.status === 'FAILED') break;

      const antiBot = await detectAntiBot(page);
      if (antiBot.blocked) {
        Logger.warn('Auth', `Creator login blocked: ${antiBot.reason}`);
        await resetLoginState('FAILED', `登录被拦截：${antiBot.reason}`);
        return;
      }

      const currentUrl = page.url();
      if (i % 5 === 0) Logger.info('Auth', `[Creator Login] URL: ${currentUrl}`);

      const isLoggedIn = await detectCreatorLogin(page);
      if (isLoggedIn) {
        Logger.info('Auth', 'Creator Center Login verified!');
        const storageState = await context.storageState();

        if (!hasValidSessionCookies(storageState)) {
          Logger.warn('Auth', 'Creator login detected but no valid cookies found in storageState');
          await resetLoginState('FAILED', '登录验证失败：未能获取有效会话');
          return;
        }

        const storageStr = JSON.stringify(storageState);
        const encryptedCookies = EncryptionService.encrypt(storageStr);

        let nickname = `账号-${Date.now().toString().slice(-4)}`;
        let avatar = '';

        try {
          const info = await page.evaluate((selectors: any) => {
            const clean = function(str: string | null) { return str ? str.trim() : ''; };
            const name = document.querySelector(selectors.Common.UserInfo.Name)?.textContent;
            const imgSrc = document.querySelector(selectors.Common.UserInfo.Avatar)?.getAttribute('src');
            return { name: clean(name || ''), avatar: imgSrc || '' };
          }, Selectors) as { name: string; avatar: string };

          if (info.name) nickname = info.name;
          if (info.avatar) avatar = info.avatar;
          Logger.info('Auth', `Captured user info: ${nickname}, avatar: ${avatar ? 'Found' : 'Missing'}`);
        } catch (e: any) {
          Logger.warn('Auth', `Failed to scrape user info: ${e.message}`);
        }

        if (accountId) {
          db.prepare('UPDATE accounts SET creator_cookies = ?, nickname = ?, avatar = ?, status = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(encryptedCookies, nickname, avatar, 'ACTIVE', accountId);
        } else {
          db.prepare('UPDATE accounts SET is_active = 0').run();
          db.prepare(`
            INSERT INTO accounts (nickname, avatar, creator_cookies, is_active, status, last_used_at)
            VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
          `).run(nickname, avatar, encryptedCookies, 'ACTIVE');
        }

        await resetLoginState('SUCCESS', 'Creator Login successful');
        return;
      }
      await page.waitForTimeout(2000);
    }

    Logger.warn('Auth', 'Creator login timeout');
    await resetLoginState('FAILED', '登录超时，请重新尝试');

  } catch (error: any) {
    Logger.error('Auth', `Creator Login failed: ${error.message}`, error);
    await resetLoginState('FAILED', error.message);
  }
}

/**
 * 功能描述：保存主站登录成功后的 Cookie 并更新账号状态
 *
 * 参数说明：
 * - context: any Playwright 浏览器上下文
 * - accountId: number 账号 ID
 * - browser: Browser | null 浏览器实例，用于登录结束后关闭
 */
async function finishMainSiteLogin(context: any, accountId: number, _browser: Browser | null): Promise<void> {
    const storageState = await context.storageState();

    // 1. 必须存在任意 Cookie
    if (!hasValidSessionCookies(storageState)) {
        Logger.warn('Auth', 'Main site login detected but no valid cookies found in storageState');
        await resetLoginState('FAILED', '登录验证失败：未能获取有效会话');
        return;
    }

    // 2. 必须包含主站认证 Cookie（web_session / websectoken），防止空会话或游客 Cookie 被保存
    if (!hasMainSiteAuthCookies(storageState.cookies)) {
        Logger.warn('Auth', 'Main site login detected but missing auth cookies (web_session / websectoken)');
        await resetLoginState('FAILED', '登录验证失败：未能获取主站认证 Cookie');
        return;
    }

    const storageStr = JSON.stringify(storageState);
    const encryptedCookies = EncryptionService.encrypt(storageStr);

    db.prepare('UPDATE accounts SET main_site_cookies = ?, status = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(encryptedCookies, 'ACTIVE', accountId);

    await resetLoginState('SUCCESS', 'Main Site Login successful');
}

// --- MAIN SITE LOGIN (For Viewing) ---
export async function startMainSiteLogin(accountId: number): Promise<void> {
  if (loginState.status === 'WAITING_FOR_SCAN') return;
  if (!accountId) {
    loginState = { status: 'FAILED', message: '缺少账号 ID', type: 'MAIN_SITE' };
    return;
  }

  loginState = { status: 'WAITING_FOR_SCAN', type: 'MAIN_SITE' };

  let browser: Browser | null = null;
  try {
    const isHeadless = process.env.HEADLESS === 'true' || (process.platform === 'linux' && !process.env.DISPLAY);
    Logger.info('Auth', `Starting main site login (headless=${isHeadless}, accountId=${accountId})`);

    browser = await launchBrowser(isHeadless);
    const context = await createBrowserContext(browser);
    const page = await context.newPage();

    // 将页面引用存入全局状态，支持二维码刷新和后续清理
    loginState.page = page;
    loginState.context = context;
    loginState.browser = browser;

    // 1. 仅注入该账号已有的【主站 Cookie】进行预检。
    //    创作服务平台 Cookie 与主站虽然可能共享 session，但二者权限独立：
    //    用户点击"绑定浏览"必须显式完成主站登录/授权，不能把创作者权限直接当成可预览权限。
    const mainSiteCookiesOnly = getMainSiteCookiesOnly(accountId);
    if (mainSiteCookiesOnly && mainSiteCookiesOnly.length > 0) {
        try {
            await context.addCookies(mainSiteCookiesOnly);
            Logger.info('Auth', `Injected ${mainSiteCookiesOnly.length} existing main-site cookies for account ${accountId}`);
        } catch (e: any) {
            Logger.warn('Auth', `Failed to inject existing main-site cookies: ${e.message}`);
        }
    } else {
        Logger.info('Auth', `No existing main-site cookies for account ${accountId}, will show QR code`);
    }

    Logger.info('Auth', 'Navigating to Xiaohongshu Main Site login...');
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' });
    // 等待页面稳定，避免 DOM 尚未渲染完成导致误判
    await page.waitForTimeout(3000);

    // 优先判断主站是否已登录：只有同时满足 DOM 登录指示 + 存在主站认证 Cookie 才跳过扫码
    const domLoggedIn = await detectMainSiteLogin(page);
    const cookieLoggedIn = hasMainSiteAuthCookies(await context.cookies());
    Logger.info('Auth', `Main site pre-check: domLoggedIn=${domLoggedIn}, cookieLoggedIn=${cookieLoggedIn}`);
    if (domLoggedIn && cookieLoggedIn) {
        Logger.info('Auth', 'Existing main-site session is valid, skipping QR scan');
        await finishMainSiteLogin(context, accountId, browser);
        return;
    }

    // 预检失败：清理上下文中的旧 Cookie，避免残留/过期 Cookie 导致后续轮询误判。
    // 用户必须重新扫码授权，不能把旧 Cookie 当成有效登录态。
    if (!domLoggedIn || !cookieLoggedIn) {
        Logger.info('Auth', 'Main site pre-check failed, clearing stale cookies before QR scan');
        await context.clearCookies();
        // 清理后刷新页面，确保页面回到未登录状态
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
    }

    // 无论是否 headless 都尝试截图二维码
    loginState.qrCodeUrl = await captureQrCode(page, 'main-site-login');

    for (let i = 0; i < 150; i++) {
      if (loginState.status === 'FAILED') break;

      const antiBot = await detectAntiBot(page);
      if (antiBot.blocked) {
        Logger.warn('Auth', `Main site login blocked: ${antiBot.reason}`);
        await resetLoginState('FAILED', `登录被拦截：${antiBot.reason}`);
        return;
      }

      const currentUrl = page.url();
      if (i % 5 === 0) Logger.info('Auth', `[Main Site Login] URL: ${currentUrl}`);

      // 必须同时满足 DOM 登录指示 + 存在主站认证 Cookie 才算登录成功，
      // 避免仅因残留 Cookie 或 DOM 误判就提前结束扫码流程。
      const domLogin = await detectMainSiteLogin(page);
      const cookieLogin = hasMainSiteAuthCookies(await context.cookies());
      if (domLogin && cookieLogin) {
        Logger.info('Auth', 'Main Site Login verified!');
        await finishMainSiteLogin(context, accountId, browser);
        return;
      }
      await page.waitForTimeout(2000);
    }

    Logger.warn('Auth', 'Main site login timeout');
    await resetLoginState('FAILED', '登录超时，请重新尝试');
  } catch (error: any) {
    Logger.error('Auth', `Main Site Login failed: ${error.message}`, error);
    await resetLoginState('FAILED', error.message);
  }
}

/**
 * 功能描述：仅获取账号的主站 Cookie（不回落到创作中心 Cookie）
 *
 * 设计思路：
 * 主站浏览权限和创作发布权限虽然可能共享 session，但在产品层面是独立的绑定入口。
 * 绑定浏览时必须使用主站自己的 cookie 判断，避免把创作者权限直接当成可预览权限。
 */
function getMainSiteCookiesOnly(accountId: number): any[] | null {
    const account = db.prepare('SELECT main_site_cookies FROM accounts WHERE id = ?').get(accountId) as { main_site_cookies?: string } | undefined;
    if (!account || !account.main_site_cookies) return null;

    try {
        const decrypted = EncryptionService.decrypt(account.main_site_cookies);
        const parsed = JSON.parse(decrypted);
        if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed.cookies;
        if (Array.isArray(parsed)) return parsed;
    } catch (_e) {
        // 如果解密失败，尝试直接解析（可能未加密）
        try {
            const parsed = JSON.parse(account.main_site_cookies);
            if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed.cookies;
            if (Array.isArray(parsed)) return parsed;
        } catch (_e2) {
            return null;
        }
    }
    return null;
}

export function getCookies(type: 'CREATOR' | 'MAIN_SITE', accountId?: number) {
    let account;
    if (accountId) {
        account = db.prepare('SELECT creator_cookies, main_site_cookies, cookies FROM accounts WHERE id = ?').get(accountId) as any;
    } else {
        account = db.prepare('SELECT creator_cookies, main_site_cookies, cookies FROM accounts WHERE is_active = 1').get() as any;
    }
    
    if (!account) {
        if (accountId) throw new Error(`Account ${accountId} not found`);
        throw new Error('No active account');
    }

    if (type === 'CREATOR') {
        const cookieStr = account.creator_cookies || account.cookies;
        if (cookieStr) {
            try {
                const decrypted = EncryptionService.decrypt(cookieStr);
                const parsed = JSON.parse(decrypted);
                // Handle Playwright Storage State format { cookies: [...], origins: [...] }
                if (parsed.cookies && Array.isArray(parsed.cookies)) {
                    return parsed.cookies;
                }
                // Handle raw array format
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            } catch (e) {
                console.error('[Auth] Failed to parse creator cookies:', e);
            }
            return null;
        }
    } else {
        // For MAIN_SITE, only use main_site_cookies. Do NOT fallback to creator_cookies
        // because creator platform permission and main-site browsing permission are
        // product-level independent. Falling back caused false-positive "preview" status.
        const cookieStr = account.main_site_cookies;
        if (cookieStr) {
            try {
                const decrypted = EncryptionService.decrypt(cookieStr);
                const parsed = JSON.parse(decrypted);
                if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed.cookies;
                if (Array.isArray(parsed)) return parsed;
            } catch (_e) {
                // If decryption fails, try parsing directly (may be unencrypted)
                try {
                    const parsed = JSON.parse(cookieStr);
                    if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed.cookies;
                    if (Array.isArray(parsed)) return parsed;
                } catch (_e2) {
                    return null;
                }
            }
        }
    }
    return null;
}

/**
 * Lightweight verification of session validity using a simple HTTP request.
 * This avoids the overhead of launching a full browser.
 */
/**
 * 功能描述：定时刷新活跃账号的小红书 Cookie，延缓“很快过期”
 *
 * 设计思路：
 * 小红书 Cookie 通常有“闲置过期”机制：如果长时间没有浏览器请求，
 * 即使 token 未到期也会被置为无效。每隔 6 小时主动访问一次创作者中心
 * 和主站首页，让 PlaywrightDriver 完成登录态校验并把最新 Cookie 回写
 * 数据库，可显著延长可用时间。
 *
 * 参数说明：
 * - accountId: [number | undefined] 账号 ID，未指定时使用当前活跃账号
 */
export async function refreshActiveAccountCookies(accountId?: number): Promise<void> {
    let account: { id: number; nickname?: string; creator_cookies?: string; main_site_cookies?: string } | undefined;
    if (accountId) {
        account = db.prepare('SELECT id, nickname, creator_cookies, main_site_cookies FROM accounts WHERE id = ?').get(accountId) as any;
    } else {
        account = db.prepare('SELECT id, nickname, creator_cookies, main_site_cookies FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
    }
    if (!account) {
        Logger.info('Auth', 'No active account to refresh cookies');
        return;
    }

    Logger.info('Auth', `Proactive cookie refresh for ${account.nickname || account.id}`);

    // 刷新主站 Cookie（浏览场景）
    if (account.main_site_cookies) {
        try {
            const session = await BrowserService.getInstance().getAuthenticatedPage('MAIN_SITE', true, account.id);
            if (session?.page) {
                await session.page.close();
            }
            Logger.info('Auth', `Main site cookies refreshed for ${account.nickname || account.id}`);
        } catch (e: any) {
            Logger.warn('Auth', `Failed to refresh main site cookies for ${account.nickname || account.id}: ${e.message}`);
        }
    }

    // 刷新创作者中心 Cookie（发布/数据场景）
    if (account.creator_cookies) {
        try {
            const session = await BrowserService.getInstance().getAuthenticatedPage('CREATOR', true, account.id);
            if (session?.page) {
                await session.page.close();
            }
            Logger.info('Auth', `Creator cookies refreshed for ${account.nickname || account.id}`);
        } catch (e: any) {
            Logger.warn('Auth', `Failed to refresh creator cookies for ${account.nickname || account.id}: ${e.message}`);
        }
    }
}

export async function verifySessionWithRequest(accountId?: number): Promise<boolean> {
    try {
        const cookies = getCookies('CREATOR', accountId);
        if (!cookies) return false;

        // Convert Playwright cookies to Header string
        const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

        // Ping a lightweight endpoint
        // 'https://creator.xiaohongshu.com/api/creator/user/info' is a good candidate
        const res = await axios.get('https://creator.xiaohongshu.com/api/creator/user/info', {
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://creator.xiaohongshu.com/creator/home',
                'Accept': 'application/json, text/plain, */*'
            },
            validateStatus: (status) => status < 500, // Don't throw on 4xx so we can handle it
            maxRedirects: 0 // CRITICAL: Do not follow redirects to login page
        });

        if (res.status === 200 && res.data && res.data.code === 0) {
            return true;
        }
        
        console.warn(`[Auth] Session verification failed for account ${accountId || 'Active'}. Status: ${res.status}, Code: ${res.data?.code}, Content-Type: ${res.headers['content-type']}`);
        return false;

    } catch (e: any) {
        // 302 Redirects will throw in axios if maxRedirects: 0
        if (e.response && (e.response.status === 301 || e.response.status === 302)) {
             console.warn(`[Auth] Session verification failed: Redirected (Cookie Expired). Account: ${accountId || 'Active'}`);
             return false;
        }

        console.error(`[Auth] Session verification error for account ${accountId || 'Active'}:`, e.message);
        return false;
    }
}
