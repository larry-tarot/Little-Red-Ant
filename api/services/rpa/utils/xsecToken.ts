/**
 * 功能描述：从小红书页面或响应中提取 xsec_token
 *
 * 设计思路：
 * 小红书笔记详情、用户主页等接口需要 xsec_token 作为反爬签名参数。
 * 该 token 通常出现在：
 * 1. window.__INITIAL_STATE__ 页面初始状态
 * 2. 页面 URL 的 query 参数中
 * 3. 某些 API 响应的 xsec_token / xsecToken 字段
 *
 * 参数说明：
 * - page: Page Playwright 页面实例
 * - fallbackUrl: string 可选，若页面未提取到，尝试访问该 URL 再提取
 *
 * 返回说明：
 * - string | null 提取到的 xsec_token，失败返回 null
 */

import { Logger } from '../../LoggerService.js';

/**
 * 从当前页面状态中提取 xsec_token
 */
export async function extractXsecTokenFromPage(page: any): Promise<string | null> {
    try {
        const state = await page.evaluate(() => {
            return (window as any).__INITIAL_STATE__;
        });

        // 尝试多个可能路径
        const candidates = [
            state?.note?.note?.xsecToken,
            state?.note?.note?.xsec_token,
            state?.note?.xsecToken,
            state?.note?.xsec_token,
            state?.user?.user?.xsecToken,
            state?.user?.user?.xsec_token,
            state?.xsecToken,
            state?.xsec_token,
        ];

        for (const token of candidates) {
            if (token && typeof token === 'string') {
                Logger.info('XsecToken', `Extracted xsec_token from page state`);
                return token;
            }
        }
    } catch (e: any) {
        Logger.warn('XsecToken', `Failed to extract from page state: ${e.message}`);
    }

    // Fallback：从当前 URL 的 query 参数中提取
    try {
        const url = page.url();
        const match = url.match(/[?&]xsec_token=([^&]+)/);
        if (match && match[1]) {
            Logger.info('XsecToken', `Extracted xsec_token from URL`);
            return decodeURIComponent(match[1]);
        }
    } catch (e: any) {
        Logger.warn('XsecToken', `Failed to extract from URL: ${e.message}`);
    }

    return null;
}

/**
 * 从 API 响应对象中提取 xsec_token
 */
export function extractXsecTokenFromResponse(data: any): string | null {
    if (!data) return null;
    const candidates = [
        data?.xsec_token,
        data?.xsecToken,
        data?.note?.xsec_token,
        data?.note?.xsecToken,
        data?.note_card?.xsec_token,
        data?.note_card?.xsecToken,
    ];
    for (const token of candidates) {
        if (token && typeof token === 'string') return token;
    }
    return null;
}
