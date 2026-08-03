/**
 * RpaPageHelpers —— RPA 页面操作工具函数集合
 *
 * 设计思路：
 * 将原本散落在 auth.ts 等文件中的页面检测逻辑（登录态、反爬、页面稳定、
 * 页面校验、通用重试）收敛到一处，避免多文件重复实现，方便统一维护。
 *
 * 使用示例：
 * ```ts
 * import * as RpaPageHelpers from './RpaPageHelpers.js';
 *
 * const isLoggedIn = await RpaPageHelpers.verifyLoginState(page, 'MAIN_SITE');
 * const antiBot = await RpaPageHelpers.detectAntiBot(page);
 * await RpaPageHelpers.waitForPageStable(page, 3000);
 * ```
 */

import { Selectors } from './config/selectors.js';

/**
 * 功能描述：检测页面是否被反爬/验证码/频率限制拦截
 *
 * 参数说明：
 * - page: [any] Playwright 页面实例
 *
 * 返回说明：
 * - { blocked: boolean; reason?: string } 是否被拦截及原因
 *
 * 使用示例：
 * ```ts
 * const result = await RpaPageHelpers.detectAntiBot(page);
 * if (result.blocked) {
 *     console.warn(`被拦截：${result.reason}`);
 * }
 * ```
 */
export async function detectAntiBot(
    page: any
): Promise<{ blocked: boolean; reason?: string }> {
    return await page.evaluate((selectors: any) => {
        const href = window.location.href;
        const pageText = document.body ? document.body.innerText : '';

        // 1. 检查滑块/验证码容器
        if (document.querySelector(selectors.Common.AntiBot.Captcha)) {
            return { blocked: true, reason: '需要安全验证（滑块/验证码）' };
        }

        // 2. 检查频率限制文案
        if (pageText.includes('访问太频繁') || pageText.includes('操作过于频繁')) {
            return { blocked: true, reason: '访问频率受限' };
        }

        // 3. 检查网络异常文案
        if (pageText.includes('网络异常') || pageText.includes('请检查网络')) {
            return { blocked: true, reason: '网络异常' };
        }

        // 4. 检查 URL 是否命中拦截/验证路径
        if (href.includes('/blocked') || href.includes('/verify')) {
            return { blocked: true, reason: '页面被拦截' };
        }

        return { blocked: false };
    }, Selectors);
}

/**
 * 功能描述：验证小红书页面登录状态
 *
 * 参数说明：
 * - page: [any] Playwright 页面实例
 * - type: ['MAIN_SITE' | 'CREATOR'] 要验证的站点类型
 *   - MAIN_SITE: 小红书主站
 *   - CREATOR: 创作者服务平台
 *
 * 返回说明：
 * - boolean true 表示已登录，false 表示未登录
 *
 * 使用示例：
 * ```ts
 * const isLoggedIn = await RpaPageHelpers.verifyLoginState(page, 'CREATOR');
 * ```
 */
export async function verifyLoginState(
    page: any,
    type: 'MAIN_SITE' | 'CREATOR'
): Promise<boolean> {
    if (type === 'CREATOR') {
        return await verifyCreatorLogin(page);
    }
    return await verifyMainSiteLogin(page);
}

/**
 * 功能描述：检测小红书主站登录状态
 *
 * 设计思路：
 * 小红书网页版登录态判断不能依赖单一选择器，需结合 URL、DOM 和文案综合判断，
 * 避免页面跳转间隙误判为未登录。
 *
 * 参数说明：
 * - page: [any] Playwright 页面实例
 *
 * 返回说明：
 * - boolean true 表示已登录
 */
async function verifyMainSiteLogin(page: any): Promise<boolean> {
    return await page.evaluate((selectors: any) => {
        const href = window.location.href;
        const pageText = document.body ? document.body.innerText : '';

        // 1. 如果仍在登录相关页面，认为未登录
        if (href.includes('/login') || href.includes('/sign')) return false;

        // 2. 检查明确的未登录指示器（登录按钮/登录容器）
        const loggedOut = document.querySelector(
            selectors.Common.Login.LoggedOutIndicators.MainSite
        );
        if (loggedOut) return false;

        // 3. 检查明确的登录指示器（右上角个人中心/头像）
        const loggedIn = document.querySelector(
            selectors.Common.Login.LoggedInIndicators.MainSite
        );
        if (loggedIn) return true;

        // 4. 兜底：页面上没有登录按钮，且存在"我的"入口
        const hasMyEntry =
            pageText.includes('我') &&
            (!!document.querySelector('a[href*="/user/profile"]') ||
                !!document.querySelector('a[href="/user/me"]'));
        const hasLoginButton =
            pageText.includes('登录') ||
            pageText.includes('手机号登录') ||
            pageText.includes('验证码登录');

        return hasMyEntry && !hasLoginButton;
    }, Selectors);
}

/**
 * 功能描述：检测小红书创作服务平台登录状态
 *
 * 参数说明：
 * - page: [any] Playwright 页面实例
 *
 * 返回说明：
 * - boolean true 表示已登录
 */
async function verifyCreatorLogin(page: any): Promise<boolean> {
    const currentUrl = page.url();

    // 必须先处于创作者域名且不在登录页
    if (!currentUrl.includes('creator.xiaohongshu.com') || currentUrl.includes('/login')) {
        return false;
    }

    return await page.evaluate((selectors: any) => {
        return !!document.querySelector(selectors.Common.Login.LoggedInIndicators.Creator);
    }, Selectors);
}

/**
 * 功能描述：等待页面稳定（DOM 渲染、网络抖动结束）
 *
 * 参数说明：
 * - page: [any] Playwright 页面实例
 * - ms: [number] 等待毫秒数，默认 2000ms
 *
 * 返回说明：
 * - void
 *
 * 使用示例：
 * ```ts
 * await RpaPageHelpers.waitForPageStable(page, 3000);
 * ```
 */
export async function waitForPageStable(page: any, ms: number = 2000): Promise<void> {
    await page.waitForTimeout(ms);
}

/**
 * 功能描述：校验页面是否符合预期条件
 *
 * 参数说明：
 * - page: [any] Playwright 页面实例
 * - options: [object] 校验配置
 *   - expectedUrl?: string 期望 URL 包含的子串
 *   - requiredText?: string 页面正文中必须包含的文案
 *   - forbiddenText?: string 页面正文中禁止出现的文案
 *
 * 返回说明：
 * - { valid: boolean; reason?: string } 校验结果及失败原因
 *
 * 使用示例：
 * ```ts
 * const result = await RpaPageHelpers.validatePage(page, {
 *     expectedUrl: '/publish/publish',
 *     requiredText: '发布',
 *     forbiddenText: '登录'
 * });
 * ```
 */
export async function validatePage(
    page: any,
    options: {
        expectedUrl?: string;
        requiredText?: string;
        forbiddenText?: string;
    }
): Promise<{ valid: boolean; reason?: string }> {
    if (!page) {
        return { valid: false, reason: '页面实例为空' };
    }

    const url = page.url();
    const pageText = await page.evaluate(() => {
        return document.body ? document.body.innerText : '';
    });

    // 按顺序校验 URL、必要文案、禁用文案
    if (options.expectedUrl && !url.includes(options.expectedUrl)) {
        return {
            valid: false,
            reason: `URL 不匹配：期望包含 "${options.expectedUrl}"，实际为 "${url}"`,
        };
    }

    if (options.requiredText && !pageText.includes(options.requiredText)) {
        return {
            valid: false,
            reason: `页面缺少必要文案："${options.requiredText}"`,
        };
    }

    if (options.forbiddenText && pageText.includes(options.forbiddenText)) {
        return {
            valid: false,
            reason: `页面出现禁用文案："${options.forbiddenText}"`,
        };
    }

    return { valid: true };
}

/**
 * 功能描述：通用异步重试包装器
 *
 * 参数说明：
 * - fn: [() => Promise<T>] 需要重试的异步函数
 * - options: [object] 重试配置
 *   - maxAttempts?: number 最大尝试次数，默认 3
 *   - delayMs?: number 每次重试间隔毫秒，默认 1000
 *   - onRetry?: (err: any, attempt: number) => void 重试前回调
 *
 * 返回说明：
 * - Promise<T> fn 的成功返回值
 *
 * 异常情况：
 * - 当所有尝试都失败时，抛出最后一次捕获的异常
 *
 * 使用示例：
 * ```ts
 * const result = await RpaPageHelpers.withRetry(
 *     async () => await fetchData(),
 *     {
 *         maxAttempts: 3,
 *         delayMs: 1000,
 *         onRetry: (err, attempt) => console.warn(`第 ${attempt} 次重试`, err)
 *     }
 * );
 * ```
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number;
        delayMs?: number;
        onRetry?: (err: any, attempt: number) => void;
    } = {}
): Promise<T> {
    const { maxAttempts = 3, delayMs = 1000, onRetry } = options;
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            // 不是最后一次尝试时，等待后重试
            if (attempt < maxAttempts) {
                if (onRetry) {
                    onRetry(err, attempt);
                }
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    throw lastError;
}
