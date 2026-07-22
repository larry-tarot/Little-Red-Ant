import { BrowserService } from './BrowserService.js';
import { Logger } from '../LoggerService.js';
import { RPAUtils } from './utils/RPAUtils.js';
import fs from 'fs';
import path from 'path';

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
    let session;
    try {
        session = await BrowserService.getInstance().getAuthenticatedPage('MAIN_SITE', true);
    } catch (e) {
        Logger.warn('RPA:Search', 'Session issue, trying fallback...');
    }

    if (!session) {
        throw new Error('Failed to create browser session for search.');
    }

    const { page } = session;
    const collectedNotes = new Map();
    const debugDir = path.join(process.cwd(), 'debug', 'search');
    let responseHandler: ((response: any) => Promise<void>) | undefined;

    try {
        Logger.info('RPA:Search', `Starting search for "${keyword}" (limit: ${limit})`);

        // Build search URL (use the standard search page)
        const encodedKeyword = encodeURIComponent(keyword);
        const sortParam = sort === 'popular' ? 'hot' : sort === 'latest' ? 'time' : 'general';
        const targetUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodedKeyword}&source=web_search_result_notes&sort=${sortParam}`;

        // Collect API responses
        const apiResponses: any[] = [];
        responseHandler = async (response: any) => {
            try {
                const url = response.url();
                // Match XHS search API endpoints
                if (url.includes('edith.xiaohongshu.com') && url.includes('search')) {
                    Logger.info('RPA:Search', `Intercepted API: ${url.substring(0, 150)}`);
                    const json = await response.json();
                    // Log the full response for debugging
                    const jsonStr = JSON.stringify(json);
                    Logger.info('RPA:Search', `API response (first 500 chars): ${jsonStr.substring(0, 500)}`);
                    apiResponses.push(json);
                }
            } catch (e) {
                // Ignore non-JSON responses
            }
        };
        page.on('response', responseHandler);

        Logger.info('RPA:Search', `Navigating to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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

        // Process API responses
        Logger.info('RPA:Search', `Processing ${apiResponses.length} API responses...`);

        for (const json of apiResponses) {
            if (!json?.data) continue;

            // Try multiple possible data structures
            let items: any[] = [];
            if (Array.isArray(json.data.items)) {
                items = json.data.items;
            } else if (Array.isArray(json.data.notes)) {
                items = json.data.notes;
            } else if (json.data.recommend_items && Array.isArray(json.data.recommend_items)) {
                items = json.data.recommend_items;
            }

            Logger.info('RPA:Search', `Response has ${items.length} items`);

            for (const item of items) {
                const note = item.note_card || item.note || item;
                if (!note?.id || collectedNotes.has(note.id)) continue;

                const token = note.xsec_token || item.xsec_token || '';
                const noteUrl = `https://www.xiaohongshu.com/explore/${note.id}?xsec_token=${token}&xsec_source=pc_search`;

                let cover = '';
                if (note.cover) {
                    cover = note.cover.url_default || note.cover.url || '';
                } else if (note.image_list && note.image_list.length > 0) {
                    cover = note.image_list[0].url_default || note.image_list[0].url || '';
                }
                if (cover && cover.startsWith('http://')) {
                    cover = cover.replace('http://', 'https://');
                }

                let heat = 0;
                const rawHeat = note.interact_info?.liked_count || '0';
                if (typeof rawHeat === 'number') {
                    heat = rawHeat;
                } else if (typeof rawHeat === 'string') {
                    if (rawHeat.includes('万')) {
                        heat = parseFloat(rawHeat.replace('万', '')) * 10000;
                    } else if (rawHeat.includes('w')) {
                        heat = parseFloat(rawHeat.replace('w', '')) * 10000;
                    } else {
                        heat = parseInt(rawHeat, 10) || 0;
                    }
                }

                let comments = -1;
                const rawComments = note.interact_info?.comment_count;
                if (rawComments !== undefined && rawComments !== null) {
                    comments = typeof rawComments === 'number' ? rawComments : parseInt(rawComments, 10) || 0;
                }

                let collects = -1;
                const rawCollects = note.interact_info?.collected_count;
                if (rawCollects !== undefined && rawCollects !== null) {
                    collects = typeof rawCollects === 'number' ? rawCollects : parseInt(rawCollects, 10) || 0;
                }

                const isVideo = note.type === 'video' || item.model_type === 'video';

                collectedNotes.set(note.id, {
                    note_id: note.id,
                    title: note.display_title || note.title || '',
                    likes_count: heat,
                    comments_count: comments,
                    collects_count: collects,
                    note_url: noteUrl,
                    cover_url: cover,
                    author_name: note.user?.nickname || note.user?.nick_name || '',
                    author_avatar: note.user?.images || note.user?.avatar || '',
                    content: note.desc || '',
                    type: isVideo ? 'video' : 'image',
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
                        const match = href.match(/\/explore\/([a-zA-Z0-9]+)/);
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
                    } catch (e) {}
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
            try { await page.close(); } catch(e) {}
        }
    }
}
