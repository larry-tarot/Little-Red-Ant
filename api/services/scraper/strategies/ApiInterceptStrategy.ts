
import { Page, Response } from 'playwright';
import { ScrapingStrategy, ScrapeResult } from './ScrapingStrategy.js';
import { Logger } from '../../LoggerService.js';
import { DataSanitizer } from '../../../utils/DataSanitizer.js';
import { extractProfileFromDomScript, parseProfileMetrics } from '../utils/ProfileExtractor.js';
import fs from 'fs';
import path from 'path';

/**
 * 功能描述：通过监听 + 主动翻页抓取竞品主页笔记
 *
 * 设计思路：
 * 1. 在 page.goto 前注册 page.on('response') 监听器，捕获首屏 user_posted API 响应
 * 2. 从首屏响应中解析 notes、user_info、cursor
 * 3. 使用 cursor 主动请求后续分页，直到无更多数据或达到上限
 * 4. 最后从 DOM / __INITIAL_STATE__ 补充用户信息
 *
 * 为什么不用 page.route()？
 * page.route() + route.fetch() + route.fulfill() 对带图片格式协商的接口容易失败；
 * page.on('response') 只读不拦截，更稳定。
 */
const DEBUG_DIR = path.join(process.cwd(), 'data');

function saveDebugJson(fileName: string, data: any) {
    try {
        if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
        fs.writeFileSync(path.join(DEBUG_DIR, fileName), JSON.stringify(data, null, 2));
    } catch (_e) {
        // 调试写入失败不影响主流程
    }
}

export class ApiInterceptStrategy implements ScrapingStrategy {
    private collectedNotes = new Map<string, any>();
    private seenNoteIds = new Set<string>();
    private userInfo: any = null;
    private nextCursor: string | null = null;
    private hasMore = true;
    private responseHandler: ((response: Response) => void) | null = null;
    private targetUserId = '';
    private apiVersion = 'v1';

    /**
     * 功能描述：重置状态并注册 response 监听器
     *
     * 参数说明：
     * - page: [Page] Playwright 页面对象
     * - userId: [string] 目标小红书用户 ID
     * - signal: [AbortSignal | undefined] 取消信号
     */
    async setup(page: Page, userId: string, signal?: AbortSignal): Promise<void> {
        this.reset();
        this.targetUserId = userId;

        this.responseHandler = (response: Response) => {
            if (signal?.aborted) return;

            const url = response.url();
            const lowerUrl = url.toLowerCase();

            // 兼容多个版本和路径变体：v1/v2/v3 的 user_posted、user/note、user/profile/notes 等
            const isUserPosted =
                lowerUrl.includes('/api/sns/web/v1/user_posted') ||
                lowerUrl.includes('/api/sns/web/v2/user_posted') ||
                lowerUrl.includes('/api/sns/web/v3/user_posted');
            const isUserNote =
                lowerUrl.includes('/api/sns/web/v2/user/note') ||
                lowerUrl.includes('/api/sns/web/v1/user/note') ||
                lowerUrl.includes('/api/sns/web/v1/user/profile/notes') ||
                lowerUrl.includes('/api/sns/web/v2/user/profile/notes');
            const isUserProfile =
                lowerUrl.includes('/api/sns/web/v1/user/profile') ||
                lowerUrl.includes('/api/sns/web/v2/user/profile') ||
                lowerUrl.includes('/api/sns/web/v1/user/info');

            if (!isUserPosted && !isUserNote && !isUserProfile) return;

            // 记录实际拦截到的 API 版本，翻页请求沿用同一版本
            if (lowerUrl.includes('/v2/')) this.apiVersion = 'v2';
            else if (lowerUrl.includes('/v3/')) this.apiVersion = 'v3';
            if (response.status() >= 400) return;

            response.json().then((json) => {
                this.processApiResponse(json, userId);
            }).catch((e: any) => {
                Logger.warn('RPA:Strategy:API', `Failed to parse response: ${e.message}`);
            });
        };

        page.on('response', this.responseHandler);
        Logger.info('RPA:Strategy:API', `Response listener registered for user ${userId}`);
    }

    /**
     * 功能描述：执行 API 抓取策略
     *
     * 参数说明：
     * - page: [Page] Playwright 页面对象
     * - userId: [string] 目标小红书用户 ID
     * - signal: [AbortSignal | undefined] 取消信号
     *
     * 返回说明：
     * - ScrapeResult | null 抓取结果
     */
    async execute(page: Page, userId: string, signal?: AbortSignal): Promise<ScrapeResult | null> {
        if (!this.responseHandler) {
            Logger.warn('RPA:Strategy:API', 'Response handler not set up, calling setup now');
            await this.setup(page, userId, signal);
        }

        Logger.info('RPA:Strategy:API', `Starting API intercept execution for user ${userId}`);

        // 前置校验：必须在正确的用户主页上执行
        const pageUrl = page.url();
        if (!pageUrl.includes(`/user/profile/${userId}`)) {
            Logger.warn('RPA:Strategy:API', `Unexpected URL ${pageUrl}, skipping API extraction`);
            return null;
        }

        const isValidPage = await page.evaluate(() => {
            const href = window.location.href;
            const pageText = document.body ? document.body.innerText : '';
            const title = document.title || '';
            return {
                isLoginPage: href.includes('/login') || href.includes('redirectPath'),
                isNotFound:
                    title.includes('404') ||
                    pageText.includes('页面不见了') ||
                    pageText.includes('用户不存在') ||
                    pageText.includes('无法浏览'),
                isBlocked:
                    pageText.includes('访问太频繁') ||
                    pageText.includes('安全验证') ||
                    pageText.includes('拖动滑块')
            };
        });

        if (isValidPage.isLoginPage || isValidPage.isNotFound || isValidPage.isBlocked) {
            Logger.warn('RPA:Strategy:API', `Page is invalid (login/notFound/blocked), skipping API extraction`);
            return null;
        }

        // 等待首屏 API 响应被处理；如果 5 秒内仍未拿到数据，轻微滚动一次触发懒加载
        let firstPageWait = 0;
        while (
            !signal?.aborted &&
            this.collectedNotes.size === 0 &&
            firstPageWait < 5000
        ) {
            await page.waitForTimeout(500);
            firstPageWait += 500;
        }
        if (this.collectedNotes.size === 0 && !signal?.aborted) {
            Logger.info('RPA:Strategy:API', 'No first-page data yet, scrolling to trigger loading');
            await page.evaluate(() => { window.scrollBy(0, 800); });
            await page.waitForTimeout(1500);
        }

        // 主动翻页：用 cursor 驱动，最多 20 页
        let pageCount = 1;
        const maxPages = 20;
        while (
            !signal?.aborted &&
            this.hasMore &&
            this.nextCursor &&
            pageCount < maxPages &&
            this.collectedNotes.size < 300
        ) {
            await this.fetchNextPage(page, userId, this.nextCursor);
            pageCount++;
            await page.waitForTimeout(1000 + Math.floor(Math.random() * 1000));
        }

        Logger.info(
            'RPA:Strategy:API',
            `API scraping finished for ${userId}: ${this.collectedNotes.size} unique notes, ${pageCount} page(s) fetched`
        );

        if (this.collectedNotes.size === 0 && !this.userInfo) {
            Logger.warn('RPA:Strategy:API', 'No API data intercepted after scrolling');
            return null;
        }

        // 从 DOM / __INITIAL_STATE__ 补充用户信息
        const domInfo = (await page.evaluate(extractProfileFromDomScript() as any)) as {
            nickname: string;
            avatar: string;
            desc: string;
            stats: string;
            fans_count: number;
            notes_count: number;
            likes_count: number;
            debug?: any;
        };

        const nickname = this.userInfo?.nickname || domInfo.nickname;
        const avatar = DataSanitizer.normalizeUrl(this.userInfo?.image || this.userInfo?.avatar || domInfo.avatar);
        const desc = this.userInfo?.desc || domInfo.desc;

        const apiMetrics = parseProfileMetrics(this.userInfo);
        const fans_count = apiMetrics.fans_count || domInfo.fans_count;
        const notes_count = apiMetrics.notes_count || domInfo.notes_count;
        const likes_count = apiMetrics.likes_count || domInfo.likes_count;

        Logger.info(
            'RPA:Strategy:API',
            `Profile metrics for ${userId}: fans=${fans_count}, notes=${notes_count}, likes=${likes_count}, ` +
            `apiMetrics=${JSON.stringify(apiMetrics)}, domDebug=${JSON.stringify(domInfo.debug)}`
        );

        const statsParts: string[] = [];
        if (fans_count > 0) statsParts.push(`${fans_count} 粉丝`);
        if (notes_count > 0) statsParts.push(`${notes_count} 笔记`);
        if (likes_count > 0) statsParts.push(`${likes_count} 获赞`);

        return {
            info: {
                nickname: nickname || '',
                avatar: avatar || '',
                desc: desc || '',
                stats: statsParts.join(' | ') || domInfo.stats,
                fans_count,
                notes_count,
                likes_count
            },
            notes: Array.from(this.collectedNotes.values()),
            source: 'API'
        };
    }

    /**
     * 功能描述：主动请求下一页数据
     *
     * 参数说明：
     * - page: [Page] Playwright 页面对象
     * - userId: [string] 目标用户 ID
     * - cursor: [string] 分页游标
     */
    private async fetchNextPage(page: Page, userId: string, cursor: string): Promise<void> {
        // 沿用首屏拦截到的 API 版本（v1/v2/v3），提高翻页请求成功率
        const url = `https://www.xiaohongshu.com/api/sns/web/${this.apiVersion}/user_posted?num=30&cursor=${encodeURIComponent(cursor)}&user_id=${userId}`;

        // 空游标不应继续请求，避免服务器返回重复首屏或错误
        if (!cursor || cursor.trim() === '') {
            Logger.warn('RPA:Strategy:API', `Empty cursor for ${userId}, stopping pagination`);
            this.hasMore = false;
            return;
        }

        try {
            Logger.info('RPA:Strategy:API', `Fetching next page for ${userId}: cursor=${cursor.substring(0, 40)}...`);

            // 使用页面内的 fetch 发起请求，让小红书前端脚本自动带上签名/anti-csrf 等必要请求头，
            // 比 page.request.get 更不容易被接口风控拒绝。
            const json = await page.evaluate(async (fetchUrl: string) => {
                const res = await fetch(fetchUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return await res.json();
            }, url);

            this.processApiResponse(json, userId);
        } catch (e: any) {
            Logger.warn('RPA:Strategy:API', `Next page request exception: ${e.message}`);
        }
    }

    /**
     * 功能描述：解析 API 响应，提取笔记、用户信息、cursor
     *
     * 参数说明：
     * - json: [any] API 响应 JSON
     * - userId: [string] 目标用户 ID
     */
    private processApiResponse(json: any, userId: string): void {
        if (!json || !json.success || !json.data) return;

        // 保存首个有效响应，便于排查 cursor/数据结构
        if (this.collectedNotes.size === 0 && userId) {
            saveDebugJson(`debug_competitor_${userId}_first_page.json`, json);
        }

        const data = json.data;

        // 解析用户信息（只取第一次）
        const profile = data.user_info || data.userInfo;
        if (profile && !this.userInfo) {
            this.userInfo = profile;
            Logger.info(
                'RPA:Strategy:API',
                `Captured user profile for ${userId}: ${JSON.stringify({
                    nickname: profile.nickname,
                    fans: profile.fans,
                    note_count: profile.note_count,
                    interactions: profile.interactions?.map((i: any) => ({ name: i.name, count: i.count }))
                })}`
            );
        }

        // 解析笔记列表
        let notes: any[] | null = null;
        if (Array.isArray(data.notes)) notes = data.notes;
        else if (Array.isArray(data.notes_list)) notes = data.notes_list;
        else if (Array.isArray(data.items)) notes = data.items;
        else if (Array.isArray(data.list)) notes = data.list;

        if (notes && notes.length > 0) {
            Logger.info('RPA:Strategy:API', `Intercepted batch for ${userId}: ${notes.length} notes`);

            for (const n of notes) {
                const noteId = n.note_id || n.id;
                if (!noteId || this.seenNoteIds.has(noteId)) continue;
                this.seenNoteIds.add(noteId);

                // 兼容新版结构：interact_info 可能嵌套在 n.interact 或 n.counts 中
                const interact = n.interact_info || n.interaction_info || n.interact || n.counts || {};
                // 拼上 xsec_token：无 token 直连笔记页会被 300031 安全重定向
                const xsecToken = n.xsec_token || n.note_card?.xsec_token || '';

                this.collectedNotes.set(noteId, {
                    note_id: noteId,
                    title: n.display_title || n.title || n.desc?.split('\n')[0]?.substring(0, 120) || '',
                    likes: this.parseCount(
                        n.likes ??
                        n.like_count ??
                        interact.liked_count ??
                        interact.likedCount ??
                        interact.likes ??
                        0
                    ),
                    comments: this.parseCount(
                        n.comments_count ??
                        n.comment_count ??
                        n.reply_count ??
                        interact.comment_count ??
                        interact.commentCount ??
                        interact.comments ??
                        0
                    ),
                    collects: this.parseCount(
                        n.collected_count ??
                        n.collect_count ??
                        n.fav_count ??
                        interact.collected_count ??
                        interact.collectedCount ??
                        interact.collect_count ??
                        interact.collects ??
                        interact.fav_count ??
                        0
                    ),
                    views: this.parseCount(
                        n.view_count ??
                        n.read_count ??
                        interact.view_count ??
                        interact.viewCount ??
                        interact.views ??
                        0
                    ),
                    cover: DataSanitizer.normalizeUrl(
                        n.cover?.url_default || n.cover?.url_pre || n.cover?.url || n.cover?.urlDefault || n.cover_url || ''
                    ),
                    url: `https://www.xiaohongshu.com/explore/${noteId}${xsecToken ? `?xsec_token=${xsecToken}&xsec_source=pc_feed` : ''}`,
                    publish_date: this.parseDate(n.last_update_time || n.time || n.create_time || n.publish_time)
                });
            }
        }

        // 更新分页游标
        const nextCursor = data.cursor || data.next_cursor || data.nextCursor;
        if (nextCursor) {
            this.nextCursor = String(nextCursor);
        } else {
            // 如果本次有数据但没有 cursor， conservatively 认为还有一页；
            // 如果本次无数据且无 cursor，停止翻页。
            this.hasMore = !!(notes && notes.length > 0);
        }
    }

    /**
     * 功能描述：重置策略内部状态
     */
    private reset(): void {
        this.collectedNotes.clear();
        this.seenNoteIds.clear();
        this.userInfo = null;
        this.nextCursor = null;
        this.hasMore = true;
        this.responseHandler = null;
        this.targetUserId = '';
        this.apiVersion = 'v1';
    }

    /**
     * 功能描述：安全解析计数（兼容字符串/数字/空值）
     */
    private parseCount(value: any): number {
        if (typeof value === 'number') return value;
        if (!value) return 0;
        return DataSanitizer.parseCount(String(value));
    }

    /**
     * 功能描述：安全解析日期
     */
    private parseDate(value: any): string | null {
        if (!value) return null;
        const d = new Date(typeof value === 'number' ? value : String(value));
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
}
