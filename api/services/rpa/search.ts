import { BrowserService } from './BrowserService.js';
import { Logger } from '../LoggerService.js';
import fs from 'fs';
import path from 'path';
import { requireActiveAccount } from './auth.js';

/**
 * Scrape search results from Xiaohongshu by keyword
 *
 * Strategy: Use authenticated browser context (like trends.ts does)
 * and let XHS page JS naturally trigger the search API.
 * We intercept the response and extract data.
 *
 * @param keyword - Search keyword (e.g. "中级会计备考")
 * @param sort - Sort mode: "general" | "latest" | "popular"
 * @param limit - Max notes to collect
 * @returns Array of scraped note metadata
 */
export async function scrapeSearchNotes(
    keyword: string,
    sort: string = 'general',
    limit: number = 20
) {
    // 0. 前置检查：必须有已激活且具备主站/任意 Cookie 的账号
    requireActiveAccount('MAIN_SITE');

    let session;
    try {
        session = await BrowserService.getInstance().getAuthenticatedPage('MAIN_SITE', true);
    } catch (_e) {
        Logger.warn('RPA:Search', 'Session issue, trying fallback...');
    }

    if (!session) {
        throw new Error('COOKIE_EXPIRED: Failed to create browser session for search. Please re-authorize in Account Matrix');
    }

    const { page } = session;
    const collectedNotes = new Map();
    const debugDir = path.join(process.cwd(), 'debug', 'search');
    let responseHandler: ((response: any) => void) | undefined;

    try {
        Logger.info('RPA:Search', `Starting search for "${keyword}" (limit: ${limit})`);

        // Build search URL (use the AI search page observed in 2025-2026)
        const encodedKeyword = encodeURIComponent(keyword);
        // 新版搜索页 source 固定为 web_explore_feed；sort 参数映射保留 but fallback to not appending unknown values
        const sortMapping: Record<string, string> = {
            general: 'general',
            popular: 'hot',
            latest: 'time'
        };
        const sortParam = sortMapping[sort] || 'general';
        // 小红书搜索页常见入口：/search_result（带 keyword 参数）
        // source=web_search_result 比 web_explore_feed 更贴近搜索场景
        const targetUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodedKeyword}&source=web_search_result${sortParam !== 'general' ? `&sort=${sortParam}` : ''}`;

        // Collect API responses
        const apiResponses: any[] = [];
        responseHandler = (response: any) => {
            const url = response.url();
            // Match XHS search API endpoints (Edith CDN / new web API / galaxy)
            // 小红书搜索 API 可能分布在多个域名和版本下，这里做宽松匹配。
            // 排除图片/静态资源请求，避免无意义解析。
            const lowerUrl = url.toLowerCase();
            const isSearchApi = (
                (lowerUrl.includes('edith.xiaohongshu.com') && lowerUrl.includes('search')) ||
                lowerUrl.includes('/api/sns/web/v1/search') ||
                lowerUrl.includes('/api/sns/web/v2/search') ||
                lowerUrl.includes('/api/sns/web/v1/search_notes') ||
                lowerUrl.includes('/api/sns/web/v2/search_notes') ||
                lowerUrl.includes('/api/galaxy/v1/search') ||
                lowerUrl.includes('/api/galaxy/v2/search') ||
                lowerUrl.includes('/api/sns/web/v1/search/notes') ||
                lowerUrl.includes('/api/sns/web/v2/search/notes')
            ) && !lowerUrl.endsWith('.png') && !lowerUrl.endsWith('.jpg') && !lowerUrl.endsWith('.jpeg') && !lowerUrl.endsWith('.gif');
            if (!isSearchApi) return;
            if (response.status() >= 400) return;

            response.json().then((json: any) => {
                Logger.info('RPA:Search', `Intercepted API: ${url.substring(0, 150)}`);
                apiResponses.push(json);
            }).catch(() => {
                // Ignore non-JSON responses
            });
        };
        page.on('response', responseHandler);

        Logger.info('RPA:Search', `Navigating to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 登录态校验：搜索页必须登录才能返回结果
        if (page.url().includes('/login')) {
            throw new Error('COOKIE_EXPIRED: Search session expired, please re-authorize in Account Matrix');
        }

        // Wait for page JS to load and trigger API calls
        Logger.info('RPA:Search', 'Waiting for page to load results...');
        await page.waitForTimeout(5000);

        // Scroll to trigger more results loading
        Logger.info('RPA:Search', 'Scrolling to load more results...');
        let scrollCount = 0;
        const maxScrolls = Math.ceil(limit / 10) + 2;

        while (scrollCount < maxScrolls) {
            await page.evaluate(() => { window.scrollBy(0, 1000); });
            await page.waitForTimeout(2000 + Math.random() * 1000);
            scrollCount++;
        }

        // Save first response for debugging
        if (apiResponses.length > 0) {
            const debugDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(
                path.join(debugDir, `debug_search_${keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.json`),
                JSON.stringify(apiResponses[0], null, 2)
            );
        }

        // Process API responses
        Logger.info('RPA:Search', `Processing ${apiResponses.length} API responses...`);

        for (const json of apiResponses) {
            const notes = extractSearchNotes(json);
            Logger.info('RPA:Search', `Response extracted ${notes.length} notes`);

            for (const note of notes) {
                if (!note.note_id || collectedNotes.has(note.note_id)) continue;
                collectedNotes.set(note.note_id, {
                    ...note,
                    search_keyword: keyword,
                    scraped_at: new Date().toISOString()
                });
            }
        }

        // Fallback: Extract from DOM if API interception yielded nothing
        if (collectedNotes.size === 0) {
            Logger.info('RPA:Search', 'API interception empty, trying DOM extraction...');

            const domNotes = await page.evaluate(() => {
                const results: any[] = [];
                const seen = new Set<string>();

                document.querySelectorAll('a[href*="/explore/"]').forEach((link) => {
                    try {
                        const href = (link as HTMLAnchorElement).href || '';
                        // 小红书笔记 ID 为 24 位十六进制字符串，避免匹配到短链或查询参数
                        const match = href.match(/\/explore\/([0-9a-f]{24})/i);
                        const noteId = match ? match[1] : '';
                        if (!noteId || seen.has(noteId)) return;
                        seen.add(noteId);

                        let container: Element | null = link;
                        for (let i = 0; i < 5; i++) {
                            if (!container?.parentElement) break;
                            container = container.parentElement;
                        }
                        if (!container) container = link;

                        let title = '';
                        const titleEls = container.querySelectorAll('span, [class*="title"], h3, h4, p');
                        for (const el of titleEls) {
                            const text = el.textContent?.trim() || '';
                            if (text.length > title.length && text.length < 200) {
                                title = text;
                            }
                        }

                        let cover = '';
                        const img = container.querySelector('img');
                        if (img) {
                            cover = img.src || img.getAttribute('data-src') || '';
                        }

                        let author = '';
                        const authorEl = container.querySelector('[class*="user"], [class*="author"]');
                        if (authorEl) {
                            author = authorEl.textContent?.trim() || '';
                        }

                        let likes = 0;
                        const likeEls = container.querySelectorAll('span, [class*="like"]');
                        for (const el of likeEls) {
                            const text = el.textContent || '';
                            const numMatch = text.match(/(\d+(?:\.\d+)?)\s*[万w]?/);
                            if (numMatch) {
                                let num = parseFloat(numMatch[1]);
                                if (text.includes('万') || text.includes('w')) num *= 10000;
                                if (num > likes) likes = num;
                            }
                        }

                        if (title || cover) {
                            results.push({
                                note_id: noteId,
                                title: title,
                                cover_url: cover,
                                author_name: author,
                                likes_count: likes,
                                note_url: href
                            });
                        }
                    } catch (_e) { /* ignore */ }
                });

                return results;
            });

            Logger.info('RPA:Search', `DOM extraction found ${domNotes.length} notes`);

            for (const n of domNotes) {
                if (!n.note_id || collectedNotes.has(n.note_id)) continue;
                collectedNotes.set(n.note_id, {
                    note_id: n.note_id,
                    title: n.title || '',
                    likes_count: n.likes_count || 0,
                    comments_count: -1,
                    collects_count: -1,
                    note_url: n.note_url || `https://www.xiaohongshu.com/explore/${n.note_id}`,
                    cover_url: n.cover_url || '',
                    author_name: n.author_name || '',
                    author_avatar: '',
                    content: '',
                    type: 'image',
                    search_keyword: keyword,
                    scraped_at: new Date().toISOString()
                });
            }
        }

        // Save debug if still empty
        if (collectedNotes.size === 0) {
            Logger.warn('RPA:Search', 'No data found. Saving debug files...');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            try {
                await page.screenshot({ path: path.join(debugDir, `search-${keyword}-${ts}.png`), fullPage: true });
                fs.writeFileSync(path.join(debugDir, `search-${keyword}-${ts}.html`), await page.content());
            } catch (e: any) {
                Logger.error('RPA:Search', `Debug save failed: ${e.message}`);
            }
        }

        const results = Array.from(collectedNotes.values()).slice(0, limit);
        Logger.info('RPA:Search', `Result: ${results.length} notes for "${keyword}"`);
        return results;
    } catch (error: any) {
        Logger.error('RPA:Search', `Search failed: ${error.message}`, error);
        throw error;
    } finally {
        if (page && responseHandler) {
            page.off('response', responseHandler);
            try { await page.close(); } catch(_e) { /* ignore */ }
        }
    }
}

/**
 * 功能描述：从搜索 API 响应中通用提取笔记列表
 *
 * 设计思路：
 * 小红书搜索接口返回结构多变，可能嵌套在 data.items / data.notes / data.result_items / data.recommend_items 等路径下，
 * 笔记对象本身也可能以 note_card / note / 平铺对象三种形式存在。本函数递归遍历常见路径，统一提取有效笔记。
 *
 * 参数说明：
 * - json: [any] API 响应 JSON
 *
 * 返回说明：
 * - 标准化后的笔记数组（未包含 search_keyword / scraped_at，由调用方补充）
 */
function extractSearchNotes(json: any): any[] {
    if (!json) return [];
    const data = json.data || json;
    if (!data || typeof data !== 'object') return [];

    // 可能的数组路径：小红书搜索/推荐/Feed 接口常用的字段名
    const candidates: any[] = [];
    for (const key of ['items', 'notes', 'result_items', 'recommend_items', 'search_notes', 'list', 'result', 'data']) {
        const arr = data[key];
        if (Array.isArray(arr)) candidates.push(...arr);
    }

    const results: any[] = [];
    const seen = new Set<string>();

    for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;

        // 笔记对象可能嵌套在 note_card / note / 平铺对象中
        const note = item.note_card || item.note || item;
        if (!note || typeof note !== 'object') continue;

        const noteId = note.id || note.note_id || note.noteId;
        if (!noteId || seen.has(String(noteId))) continue;

        // 校验 noteId 格式：24 位十六进制，避免保存垃圾 ID
        if (!/^[0-9a-f]{24}$/i.test(String(noteId))) continue;

        seen.add(String(noteId));

        const token = note.xsec_token || item.xsec_token || note.xsecToken || '';
        const noteUrl = token
            ? `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${token}&xsec_source=pc_search`
            : `https://www.xiaohongshu.com/explore/${noteId}`;

        let cover = '';
        const coverObj = note.cover || note.covers?.[0] || note.cover_info;
        if (coverObj) {
            cover = coverObj.url_default || coverObj.url || coverObj.url_pre || coverObj.trace_list?.[0] || '';
        } else if (Array.isArray(note.image_list) && note.image_list.length > 0) {
            cover = note.image_list[0].url_default || note.image_list[0].url || '';
        } else if (Array.isArray(note.images_list) && note.images_list.length > 0) {
            cover = note.images_list[0].url_default || note.images_list[0].url || '';
        } else if (Array.isArray(note.imageList) && note.imageList.length > 0) {
            cover = note.imageList[0].url_default || note.imageList[0].url || '';
        }
        if (cover && cover.startsWith('http://')) {
            cover = cover.replace('http://', 'https://');
        }

        // 互动信息可能在多个位置
        const interact = note.interact_info || note.interaction_info || note.interact || note.counts || {};
        const likes = parseCount(
            note.likes ??
            note.like_count ??
            note.liked_count ??
            interact.liked_count ??
            interact.like_count ??
            interact.likes ??
            0
        );
        const comments = parseCount(
            note.comments_count ??
            note.comment_count ??
            note.reply_count ??
            interact.comment_count ??
            interact.comments ??
            -1
        );
        const collects = parseCount(
            note.collected_count ??
            note.collect_count ??
            note.fav_count ??
            interact.collected_count ??
            interact.collect_count ??
            interact.fav_count ??
            -1
        );

        const user = note.user || note.author || note.user_info || {};
        const isVideo = note.type === 'video' || item.model_type === 'video' || note.video_info !== undefined || note.video !== undefined;

        results.push({
            note_id: noteId,
            title: note.display_title || note.title || note.desc?.split('\n')[0]?.substring(0, 120) || '',
            likes_count: likes,
            comments_count: comments,
            collects_count: collects,
            note_url: noteUrl,
            cover_url: cover,
            author_name: user.nickname || user.nick_name || user.name || '',
            author_avatar: user.images || user.avatar || user.image || '',
            content: note.desc || '',
            type: isVideo ? 'video' : 'image'
        });
    }

    return results;
}

/**
 * 功能描述：安全解析计数（兼容字符串/数字/空值）
 */
function parseCount(value: any): number {
    if (typeof value === 'number') return value;
    if (value === undefined || value === null) return -1;
    const str = String(value).trim();
    if (!str) return -1;
    if (str.includes('万')) return Math.round(parseFloat(str.replace(/[^\d.]/g, '')) * 10000);
    if (str.includes('w') || str.includes('W')) return Math.round(parseFloat(str.replace(/[^\d.]/g, '')) * 10000);
    return parseInt(str.replace(/[^\d]/g, ''), 10) || 0;
}
