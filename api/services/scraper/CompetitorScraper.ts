
import { BrowserService } from '../rpa/BrowserService.js';
import { Logger } from '../LoggerService.js';
import { AccountService } from '../core/AccountService.js';
import { ApiInterceptStrategy } from './strategies/ApiInterceptStrategy.js';
import { DomScrapeStrategy } from './strategies/DomScrapeStrategy.js';
import { ScrapeResult, ScrapingStrategy } from './strategies/ScrapingStrategy.js';
import db from '../../db.js';

/**
 * 功能描述：竞品数据抓取 orchestrator
 *
 * 职责：
 * 1. 管理登录态会话（小红书已不允许匿名访问用户主页）
 * 2. 检查页面是否被拦截、404、登录页
 * 3. 按优先级执行 API 拦截 -> DOM 兜底 两种策略
 * 4. 对结果进行基础校验和错误分类
 *
 * 重要说明：
 * 自 2025 年中起，小红书用户主页必须登录后才能访问。
 * 因此本抓取器不再尝试匿名 fallback；没有有效账号时直接报错。
 */
export class CompetitorScraper {
    private strategies: ScrapingStrategy[] = [
        new ApiInterceptStrategy(),
        new DomScrapeStrategy()
    ];

    /**
     * 功能描述：抓取指定小红书用户的竞品数据
     *
     * 参数说明：
     * - userId: [string] 小红书用户 ID
     *
     * 返回说明：
     * - ScrapeResult 抓取结果
     *
     * 异常情况：
     * - 无有效账号：抛出 'NO_ACTIVE_ACCOUNT'
     * - Cookie 失效：抛出 'COOKIE_EXPIRED'
     * - 页面被拦截/需要验证：抛出 'BLOCKED_OR_VERIFY'
     * - 用户不存在/已注销：抛出 'PROFILE_NOT_FOUND'
     * - 所有策略失败：抛出 'All scraping strategies failed'
     */
    async scrape(userId: string, signal?: AbortSignal): Promise<ScrapeResult> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }

        const targetUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
        Logger.info('RPA:Competitor', `Starting scrape for user: ${userId}`);

        // 0. 前置检查：必须有已激活且至少有一种有效 cookie 的账号
        const activeAccount = db.prepare(
            'SELECT id, creator_cookies, main_site_cookies, cookies FROM accounts WHERE is_active = 1 LIMIT 1'
        ).get() as { id: number; creator_cookies?: string; main_site_cookies?: string; cookies?: string } | undefined;

        if (!activeAccount) {
            Logger.warn('RPA:Competitor', 'No active account found, cannot scrape competitor profile');
            throw new Error('NO_ACTIVE_ACCOUNT: Please bind a Xiaohongshu account in Account Matrix first');
        }

        const hasAnyCookie = !!(activeAccount.creator_cookies || activeAccount.main_site_cookies || activeAccount.cookies);
        if (!hasAnyCookie) {
            Logger.warn('RPA:Competitor', `Active account ${activeAccount.id} has no cookies`);
            throw new Error('COOKIE_EXPIRED: Account cookies missing, please re-authorize in Account Matrix');
        }

        // 1. 获取已登录会话（只允许已登录态，只用主站 Cookie）
        const session = await this.getAuthenticatedSession();
        if (!session) {
            throw new Error('COOKIE_EXPIRED: Failed to create authenticated browser session');
        }

        // 2. 在主站环境下预热一个普通页面，让 Cookie 与浏览器指纹先活跃起来，降低一进主页就被风控的概率
        try {
            await session.page.goto('https://www.xiaohongshu.com/explore', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });
            await session.page.waitForTimeout(1500 + Math.floor(Math.random() * 1000));
        } catch (e: any) {
            Logger.warn('RPA:Competitor', `Pre-warm explore page failed: ${e.message}`);
        }

        try {
            if (signal?.aborted) throw new Error('TASK_CANCELLED');

            // 预设置拦截器/监听（API 拦截策略需要在 page.goto 前设置 route）
            for (const strategy of this.strategies) {
                if (strategy.setup) {
                    await strategy.setup(session.page, userId, signal);
                }
            }

            if (signal?.aborted) throw new Error('TASK_CANCELLED');

            // 导航到目标主页
            await session.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await session.page.waitForTimeout(2000);

            if (signal?.aborted) throw new Error('TASK_CANCELLED');

            const pageUrl = session.page.url();
            const pageTitle = await session.page.title();
            Logger.info('RPA:Competitor', `Page loaded: title='${pageTitle}', url=${pageUrl}`);

            // 2. 登录态检查：已被重定向到登录页说明主站浏览 Cookie 失效
            if (pageUrl.includes('/login') || pageUrl.includes('redirectPath')) {
                Logger.warn('RPA:Competitor', 'Main site session expired on target profile page');
                // 主动清除失效的 main_site_cookies，让账号矩阵正确显示"未绑定浏览"
                try {
                    const activeAccount = db.prepare('SELECT id FROM accounts WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined;
                    if (activeAccount) {
                        AccountService.clearMainSiteCookies(activeAccount.id);
                    }
                } catch (_e) {
                    // 清除失败不影响本次错误抛出
                }
                throw new Error('COOKIE_EXPIRED: 主站浏览权限已失效，请前往账号矩阵重新绑定"浏览权限"');
            }

            // 3. 安全与状态检查
            const status = await this.checkPageStatus(session.page);
            if (status.blocked || status.needsVerify) {
                throw new Error('BLOCKED_OR_VERIFY: Access blocked or verification required');
            }
            if (status.notFound) {
                throw new Error('PROFILE_NOT_FOUND: User profile does not exist or is unavailable');
            }

            // 4. 额外防护：如果页面不是期望的主页路径，可能是被劫持/重定向，拒绝提取数据
            if (!pageUrl.includes(`/user/profile/${userId}`)) {
                Logger.warn('RPA:Competitor', `Unexpected page URL after navigation: ${pageUrl}`);
                throw new Error('COOKIE_EXPIRED: Unexpected redirect detected');
            }

            if (signal?.aborted) throw new Error('TASK_CANCELLED');

            // 5. 执行抓取策略
            let lastError: Error | null = null;
            for (const strategy of this.strategies) {
                try {
                    if (signal?.aborted) throw new Error('TASK_CANCELLED');

                    const result = await strategy.execute(session.page, userId, signal);
                    if (result && this.isValidResult(result)) {
                        Logger.info('RPA:Competitor', `Strategy ${strategy.constructor.name} succeeded: ${result.notes.length} notes`);
                        return result;
                    }
                    Logger.warn('RPA:Competitor', `Strategy ${strategy.constructor.name} returned empty or invalid result`);
                } catch (e: any) {
                    lastError = e;
                    Logger.warn('RPA:Competitor', `Strategy ${strategy.constructor.name} failed: ${e.message}`);
                }
            }

            throw new Error(lastError?.message || 'All scraping strategies failed');

        } finally {
            // 只关闭当前页面；persistent context 由 BrowserService 复用，关闭它会破坏
            // 其他任务的会话。
            try {
                if (session.page && !session.page.isClosed()) await session.page.close();
            } catch (e: any) {
                Logger.warn('RPA:Competitor', `Failed to close page: ${e.message}`);
            }
        }
    }

    /**
     * 功能描述：校验抓取结果是否可信
     *
     * 设计思路：
     * - 必须拿到昵称，或拿到至少一条笔记
     * - 粉丝/笔记/获赞数字不能全部为 0 且没有任何笔记（避免把错误页当有效页）
     */
    private isValidResult(result: ScrapeResult): boolean {
        if (!result) return false;
        const hasNickname = !!result.info?.nickname;
        const hasNotes = Array.isArray(result.notes) && result.notes.length > 0;
        const hasMetrics =
            (result.info?.fans_count || 0) > 0 ||
            (result.info?.notes_count || 0) > 0 ||
            (result.info?.likes_count || 0) > 0;

        // 有效条件：有昵称 +（有笔记 或 有指标）
        return hasNickname && (hasNotes || hasMetrics);
    }

    /**
     * 功能描述：获取已登录会话（不导航），失败返回 null
     *
     * 设计约束：
     * 小红书用户主页属于“浏览”场景，必须且只能使用主站 Cookie（main_site_cookies），
     * 禁止使用创作者中心 Cookie（creator_cookies）回退，避免跨域登录态混乱。
     */
    private async getAuthenticatedSession(): Promise<any | null> {
        try {
            return await BrowserService.getInstance().getAuthenticatedPage('MAIN_SITE', true);
        } catch (_e) {
            Logger.warn('RPA:Competitor', 'Main Site cookie missing/invalid');
            return null;
        }
    }

    /**
     * 功能描述：检查当前页面是否被拦截、需要验证或 404
     */
    private async checkPageStatus(page: any) {
        return await page.evaluate(() => {
            const pageText = document.body ? document.body.innerText : '';
            const title = document.title || '';

            const blocked =
                pageText.includes('访问太频繁') ||
                pageText.includes('访问受限') ||
                pageText.includes('网络异常') ||
                pageText.includes('请稍后重试');

            const needsVerify =
                pageText.includes('安全验证') ||
                pageText.includes('拖动滑块') ||
                pageText.includes('验证码');

            const notFound =
                title.includes('404') ||
                pageText.includes('页面不见了') ||
                pageText.includes('用户不存在') ||
                pageText.includes('无法浏览') ||
                pageText.includes('账号已注销');

            return { blocked, needsVerify, notFound };
        });
    }
}
