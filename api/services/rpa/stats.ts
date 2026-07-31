
import { BrowserService } from './BrowserService.js';
import db from '../../db.js';
import { AccountService } from '../core/AccountService.js';
import fs from 'fs';
import path from 'path';
import { Logger } from '../LoggerService.js';
import { Page, Response } from 'playwright';
import { Selectors } from './config/selectors.js';
import { config } from '../../config.js';

const SCREENSHOT_DIR = path.join(config.paths.public, 'screenshots');
const DEBUG_DIR = path.join(process.cwd(), 'data');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    try {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    } catch (e) {
        console.error('[Stats] Failed to create screenshot directory:', e);
    }
}

/**
 * 功能描述：标准化笔记字段
 *
 * 设计思路：
 * 小红书不同接口返回的字段名不同，这里按优先级统一转换为内部结构。
 * 优先使用 interact_info 中的结构化互动数，避免 DOM 猜数字。
 */
export interface NormalizedNote {
    note_id: string;
    title: string;
    cover_image: string;
    publish_date: string | null;
    views: number;
    likes: number;
    comments: number;
    collects: number;
    shares: number;
    xsec_token: string;
    _source: 'GALAXY_API' | 'DOM_FALLBACK' | 'NETWORK_INTERCEPT';
}

/**
 * 功能描述：将小红书各种时间戳格式统一转为 ISO 字符串
 *
 * 参数说明：
 * - ts: [number | string] 可能是秒级/毫秒级时间戳，也可能是已格式化的日期字符串
 *
 * 返回说明：
 * - string | null ISO 格式日期字符串，无法解析时返回 null
 */
function parseTimestampToISO(ts: any): string | null {
    if (!ts && ts !== 0) return null;

    if (typeof ts === 'number' || !isNaN(Number(ts))) {
        const numTs = Number(ts);
        const date = new Date(numTs > 10000000000 ? numTs : numTs * 1000);
        if (!isNaN(date.getTime())) return date.toISOString();
    }

    if (typeof ts === 'string') {
        const date = new Date(ts);
        if (!isNaN(date.getTime())) return date.toISOString();
    }

    return null;
}

/**
 * 功能描述：解析带 w/万/k 单位的数字字符串
 *
 * 参数说明：
 * - str: [string | null | undefined] 待解析字符串
 *
 * 返回说明：
 * - number 解析后的整数，失败返回 0
 */
function parseCompactNumber(str: any): number {
    if (!str) return 0;
    const s = String(str).trim();
    if (!s) return 0;

    const lower = s.toLowerCase();
    const hasUnit = /[w万k]/.test(lower);
    const numericPart = parseFloat(lower.replace(/[^0-9.]/g, ''));

    if (isNaN(numericPart)) return 0;
    if (lower.includes('w') || lower.includes('万')) return Math.round(numericPart * 10000);
    if (lower.includes('k')) return Math.round(numericPart * 1000);

    // 如果原字符串含单位但 parseFloat 得到小于 1 的小数，按万处理（兜底）
    if (hasUnit && numericPart < 1) return Math.round(numericPart * 10000);

    return Math.round(numericPart);
}

/**
 * 功能描述：安全地保存调试用 JSON 文件
 *
 * 参数说明：
 * - fileName: [string] 文件名
 * - data: [any] 待保存数据
 */
function saveDebugJson(fileName: string, data: any) {
    try {
        if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
        fs.writeFileSync(path.join(DEBUG_DIR, fileName), JSON.stringify(data, null, 2));
    } catch (_e) {
        // 调试写入失败不应影响主流程
    }
}

/**
 * 功能描述：从 Galaxy API 单条 note 记录中提取统一字段
 *
 * 参数说明：
 * - item: [any] Galaxy API 返回的单条笔记原始数据
 * - source: [NormalizedNote['_source']] 数据来源标记
 *
 * 返回说明：
 * - NormalizedNote | null 标准化后的笔记对象，关键字段缺失时返回 null
 */
function normalizeGalaxyItem(item: any, source: NormalizedNote['_source'] = 'GALAXY_API'): NormalizedNote | null {
    if (!item || typeof item !== 'object') return null;

    const noteId = item.note_id || item.id || item.noteId;
    if (!noteId) return null;

    const title = item.display_title || item.title || item.caption?.split('\n')[0]?.substring(0, 120) || '';

    let cover = '';
    const coverObj = item.cover || item.covers?.[0];
    if (coverObj?.url_default) cover = coverObj.url_default;
    else if (coverObj?.url) cover = coverObj.url;
    else if (coverObj?.url_pre) cover = coverObj.url_pre;
    else if (typeof item.cover === 'string') cover = item.cover;
    else if (item.images_list?.length > 0) cover = item.images_list[0].url_default || item.images_list[0].url;
    else if (item.images_list_v2?.length > 0) cover = item.images_list_v2[0].url_default || item.images_list_v2[0].url;

    const interact = item.interact_info || item.interaction_info || item.interact || {};

    // Galaxy API 的 /creator/note/user/posted 把互动数字直接挂在 item 上
    const views = item.view_count ?? item.read_count ?? interact.view_count ?? interact.read_count ?? 0;
    const likes = item.likes ?? item.like_count ?? interact.liked_count ?? interact.like_count ?? interact.likes ?? 0;
    const comments = item.comments_count ?? item.comment_count ?? item.comments ?? interact.comment_count ?? interact.comments ?? item.reply_count ?? 0;
    const collects = item.collected_count ?? item.collect_count ?? item.collects ?? interact.collected_count ?? interact.collect_count ?? interact.fav_count ?? item.fav_count ?? 0;
    const shares = item.shared_count ?? item.share_count ?? item.shares ?? interact.share_count ?? interact.shares ?? 0;

    const publishDate = parseTimestampToISO(
        item.create_time ?? item.time ?? item.upload_time ?? item.pub_time ?? item.display_time ?? item.last_update_time
    );

    const xsecToken = item.xsec_token || item.xsecToken || '';

    return {
        note_id: String(noteId),
        title: String(title || '').trim(),
        cover_image: cover,
        publish_date: publishDate,
        views: Number(views) || 0,
        likes: Number(likes) || 0,
        comments: Number(comments) || 0,
        collects: Number(collects) || 0,
        shares: Number(shares) || 0,
        xsec_token: xsecToken,
        _source: source
    };
}

/**
 * 功能描述：从 Galaxy API 响应中解析笔记列表
 *
 * 参数说明：
 * - json: [any] fetch 返回的 JSON
 *
 * 返回说明：
 * - NormalizedNote[] 标准化后的笔记数组
 */
function parseGalaxyResponse(json: any): NormalizedNote[] {
    if (!json) return [];

    const data = json.data;
    if (!data) return [];

    let rawItems: any[] = [];
    if (Array.isArray(data.notes)) rawItems = data.notes;
    else if (Array.isArray(data.items)) rawItems = data.items;
    else if (Array.isArray(data.list)) rawItems = data.list;
    else if (Array.isArray(data.data)) rawItems = data.data;
    else if (Array.isArray(data)) rawItems = data;

    return rawItems
        .map(item => normalizeGalaxyItem(item, 'GALAXY_API'))
        .filter((n): n is NormalizedNote => n !== null);
}



/**
 * 功能描述：异步任务进度截图
 *
 * 参数说明：
 * - page: [Page] Playwright 页面对象
 * - taskId: [string] 任务 ID
 */
async function takeProgressScreenshot(page: Page, taskId?: string) {
    if (!taskId) return;
    try {
        const filePath = path.join(SCREENSHOT_DIR, `${taskId}.jpg`);
        await page.screenshot({ path: filePath, quality: 60, type: 'jpeg' });
    } catch (e) {
        console.error('Failed to take progress screenshot', e);
    }
}

/**
 * 功能描述：创作者中心 Galaxy API 抓取客户端
 *
 * 设计思路：
 * 1. 在 page.goto 前注册 page.on('response') 监听器，捕获页面自己发出的 Galaxy API 请求
 * 2. 让创作者中心笔记管理页面自己加载数据，避免我们伪造请求头触发 406
 * 3. 通过滚动/点击分页触发更多页面加载
 * 4. 对监听不到的后续页，再尝试用页面自身 JS 环境补一页
 */
class GalaxyApiClient {
    private collectedNotes = new Map<string, NormalizedNote>();
    private responseHandler: ((response: Response) => void) | null = null;
    private lastChangeAt = Date.now();
    private hasMore = true;

    constructor(private page: Page, private maxNotes = 2000) {}

    /**
     * 功能描述：注册 Galaxy API 响应监听器
     */
    registerListener(): void {
        this.collectedNotes.clear();
        this.hasMore = true;
        this.lastChangeAt = Date.now();

        this.responseHandler = (response: Response) => {
            const url = response.url();
            if (!url.includes('/api/galaxy/v2/creator/note/user/posted')) return;
            if (response.status() >= 400) return;

            response.json().then((json) => {
                this.processResponse(json);
            }).catch(() => {
                // 非 JSON 响应忽略
            });
        };

        this.page.on('response', this.responseHandler);
        Logger.info('RPA:Stats', 'Galaxy API response listener registered');
    }

    /**
     * 功能描述：等待并触发页面加载全部笔记
     *
     * 返回说明：
     * - NormalizedNote[] 收集到的所有笔记
     */
    async fetchAllNotes(): Promise<NormalizedNote[]> {
        if (!this.responseHandler) {
            this.registerListener();
        }

        // 等待首屏 API 返回
        await this.page.waitForTimeout(2500);

        // 通过滚动/分页触发更多加载，直到 8 秒没有新数据或达到上限
        let attempts = 0;
        const maxAttempts = 50;

        while (this.hasMore && attempts < maxAttempts && this.collectedNotes.size < this.maxNotes) {
            const beforeCount = this.collectedNotes.size;

            await this.triggerNextPageLoad();
            await this.page.waitForTimeout(1500 + Math.floor(Math.random() * 1000));

            if (this.collectedNotes.size > beforeCount) {
                this.lastChangeAt = Date.now();
                attempts = 0;
            } else {
                attempts++;
                // 如果连续 4 次（约 8 秒）没有新数据，认为到底
                if (Date.now() - this.lastChangeAt > 8000) {
                    Logger.info('RPA:Stats', 'No new Galaxy notes for 8s, stopping scroll');
                    break;
                }
            }
        }

        Logger.info('RPA:Stats', `Galaxy API total unique notes: ${this.collectedNotes.size}`);
        return Array.from(this.collectedNotes.values());
    }

    /**
     * 功能描述：触发下一页加载
     *
     * 设计思路：
     * 优先尝试滚动页面；如果滚动无效，尝试点击“下一页/加载更多”按钮。
     */
    private async triggerNextPageLoad(): Promise<void> {
        await this.page.evaluate(() => {
            // 优先滚动可滚动容器或 body
            let scroller: Element = document.documentElement;
            const candidates = document.querySelectorAll('div, main, section, .layout-container, .content-container');
            let maxScroll = 0;

            candidates.forEach(el => {
                const style = window.getComputedStyle(el);
                const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
                if (isScrollable && el.scrollHeight > maxScroll) {
                    maxScroll = el.scrollHeight;
                    scroller = el;
                }
            });

            const step = 600 + Math.floor(Math.random() * 400);
            if (scroller === document.documentElement) {
                window.scrollBy(0, step);
            } else {
                (scroller as Element).scrollBy(0, step);
            }
        });

        // 兜底：尝试点击“下一页”/“加载更多”按钮
        try {
            const nextBtn = await this.page.$('button:has-text("下一页"), button:has-text("加载更多"), [class*="pagination-next"], [class*="load-more"]');
            if (nextBtn) {
                await nextBtn.click();
            }
        } catch (_e) {
            // 没有按钮也忽略
        }
    }

    /**
     * 功能描述：解析 Galaxy API 响应
     *
     * 参数说明：
     * - json: [any] API 响应 JSON
     */
    private processResponse(json: any): void {
        if (!json) return;
        const data = json.data || json;

        // 保存第一页原始响应用于调试
        if (this.collectedNotes.size === 0) {
            saveDebugJson('debug_galaxy_first_page.json', json);
        }

        const notes = parseGalaxyResponse(json);
        if (notes.length > 0) {
            for (const note of notes) {
                this.collectedNotes.set(note.note_id, note);
            }
            Logger.info('RPA:Stats', `Galaxy response intercepted: ${notes.length} notes, total=${this.collectedNotes.size}`);
        }

        // 判断是否有更多页
        const hasMoreFlag = data.has_more ?? data.hasMore ?? data.hasNext ?? data.has_next;
        if (hasMoreFlag === false) {
            this.hasMore = false;
        }
    }
}

/**
 * 功能描述：DOM 兜底抓取器
 *
 * 设计思路：
 * 当 Galaxy API 因风控、接口变更等原因拿不到足够数据时，
 * 通过滚动创作者中心笔记管理页面，从 DOM 中解析指标。
 * DOM 数据可信度低于 API，因此只用于补充缺失笔记，不覆盖 API 已返回的正数指标。
 */
class DomFallbackScraper {
    constructor(private page: Page) {}

    /**
     * 功能描述：滚动页面并抓取可见笔记
     *
     * 返回说明：
     * - NormalizedNote[] 从 DOM 中解析出的笔记数组
     */
    async scrape(): Promise<NormalizedNote[]> {
        Logger.info('RPA:Stats', 'Starting DOM fallback scraper');

        const domNotesMap = new Map<string, NormalizedNote>();
        await this.page.exposeFunction('saveDomNotes', (notes: any[]) => {
            notes.forEach(n => {
                if (n.note_id && !domNotesMap.has(n.note_id)) {
                    const normalized = normalizeGalaxyItem(n, 'DOM_FALLBACK');
                    if (normalized) domNotesMap.set(n.note_id, normalized);
                }
            });
        });

        await this.page.evaluate(async (selectors: any) => {
            return new Promise<void>((resolve) => {
                let totalScroll = 0;
                let noChangeCount = 0;
                let lastItemCount = 0;

                const parseNum = (str: any) => parseCompactNumber(str);

                const getStatsFromItem = (el: Element) => {
                    const stats = { views: 0, likes: 0, comments: 0, collects: 0 };

                    const findNumByIcon = (iconPatterns: string[]) => {
                        for (const pattern of iconPatterns) {
                            const icon = el.querySelector('[class*="' + pattern + '"]') || el.querySelector('svg[class*="' + pattern + '"]');
                            if (icon) {
                                const parent = icon.parentElement;
                                const text = parent?.innerText || (icon.nextElementSibling as HTMLElement)?.innerText || '';
                                const num = parseNum(text);
                                if (num > 0) return num;
                            }
                        }
                        return null;
                    };

                    const v = findNumByIcon(selectors.CreatorCenter.Stats.Icons.Views);
                    const l = findNumByIcon(selectors.CreatorCenter.Stats.Icons.Likes);
                    const c = findNumByIcon(selectors.CreatorCenter.Stats.Icons.Comments);
                    const s = findNumByIcon(selectors.CreatorCenter.Stats.Icons.Collects);

                    if (v !== null) stats.views = v;
                    if (l !== null) stats.likes = l;
                    if (c !== null) stats.comments = c;
                    if (s !== null) stats.collects = s;

                    const getStatByKeyword = (keywords: string[]) => {
                        const text = (el as HTMLElement).innerText || '';
                        for (const kw of keywords) {
                            const regex = new RegExp('(\\d+[\\d\\.]*[kw]?)\\s*[\\n\\s]*' + kw + '|' + kw + '\\s*[\\n\\s]*(\\d+[\\d\\.]*[kw]?)', 'i');
                            const match = text.match(regex);
                            if (match) return parseNum(match[1] || match[2]);
                        }
                        return 0;
                    };

                    if (stats.views === 0) stats.views = getStatByKeyword(selectors.CreatorCenter.Stats.Keywords.Views);
                    if (stats.likes === 0) stats.likes = getStatByKeyword(selectors.CreatorCenter.Stats.Keywords.Likes);
                    if (stats.comments === 0) stats.comments = getStatByKeyword(selectors.CreatorCenter.Stats.Keywords.Comments);
                    if (stats.collects === 0) stats.collects = getStatByKeyword(selectors.CreatorCenter.Stats.Keywords.Collects);

                    return stats;
                };

                const parseDateFromText = (text: string): string | null => {
                    const dateMatch = text.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
                    if (dateMatch) {
                        const clean = dateMatch[1].replace(/[年月]/g, '-').replace(/\//g, '-');
                        const d = new Date(clean);
                        if (!isNaN(d.getTime())) return d.toISOString();
                    }

                    const today = new Date();
                    if (text.includes('昨天')) {
                        today.setDate(today.getDate() - 1);
                    } else if (text.includes('前天')) {
                        today.setDate(today.getDate() - 2);
                    } else {
                        const daysMatch = text.match(/(\d+)天前/);
                        if (daysMatch) today.setDate(today.getDate() - parseInt(daysMatch[1]));
                    }
                    return today.toISOString();
                };

                const scrapeVisible = () => {
                    const items = Array.from(document.querySelectorAll(selectors.CreatorCenter.NoteList.Item));

                    const batch = items.map((el: Element) => {
                        let noteId = el.getAttribute('data-note-id');
                        if (!noteId) {
                            const link = el.querySelector('a[href*="/explore/"], a[href*="/item/"]');
                            if (link) {
                                const href = link.getAttribute('href');
                                if (href) noteId = href.split('/').pop() || '';
                            }
                        }

                        if (!noteId) return null;

                        let title = '';
                        const titleEl = el.querySelector(selectors.CreatorCenter.NoteList.Title);
                        if (titleEl) title = titleEl.textContent?.trim() || '';

                        let cover = '';
                        const imgEl = el.querySelector(selectors.CreatorCenter.NoteList.Image) as HTMLImageElement | null;
                        if (imgEl) cover = imgEl.src;

                        const stats = getStatsFromItem(el);
                        const pubDate = parseDateFromText(el.textContent || '');

                        return {
                            note_id: noteId,
                            title,
                            cover_image: cover,
                            views: stats.views,
                            likes: stats.likes,
                            comments: stats.comments,
                            collects: stats.collects,
                            publish_date: pubDate,
                            _source: 'DOM_FALLBACK'
                        };
                    }).filter(n => n !== null);

                    if ((window as any).saveDomNotes) {
                        (window as any).saveDomNotes(batch);
                    }

                    return batch.length;
                };

                const timer = setInterval(() => {
                    let scroller: Element = document.documentElement;
                    const candidates = document.querySelectorAll('div, main, section, .layout-container, .content-container');
                    let maxScroll = 0;

                    candidates.forEach(el => {
                        const style = window.getComputedStyle(el);
                        const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
                        if (isScrollable && el.scrollHeight > maxScroll) {
                            maxScroll = el.scrollHeight;
                            scroller = el;
                        }
                    });

                    const scrollStep = 300 + Math.floor(Math.random() * 200);
                    if (scroller === document.documentElement) {
                        window.scrollBy(0, scrollStep);
                    } else {
                        (scroller as Element).scrollBy(0, scrollStep);
                    }

                    const currentCount = scrapeVisible();
                    totalScroll += scrollStep;

                    if (currentCount === lastItemCount) {
                        noChangeCount++;
                    } else {
                        noChangeCount = 0;
                        lastItemCount = currentCount;
                    }

                    if (totalScroll > 100000 || noChangeCount > 50) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 500);
            });
        }, Selectors);

        Logger.info('RPA:Stats', `DOM fallback scraper found ${domNotesMap.size} unique notes`);
        return Array.from(domNotesMap.values());
    }
}

/**
 * 功能描述：笔记统计数据持久化仓库
 *
 * 设计思路：
 * 1. 优先保存 Galaxy API 数据（可信度高）
 * 2. DOM 兜底数据只补充缺失字段，不覆盖 API 已返回的正数指标
 * 3. 每次保存同时写入历史表，用于趋势图
 * 4. 对 0 值做合理保护：API 明确返回的 0 允许覆盖；DOM 解析的 0 不覆盖历史高值
 */
class NoteStatsRepository {
    constructor(private accountId: number) {}

    /**
     * 功能描述：保存或更新笔记统计
     *
     * 参数说明：
     * - notes: [NormalizedNote[]] 抓取到的笔记数据
     *
     * 返回说明：
     * - { updated: number; inserted: number } 更新/插入数量
     */
    save(notes: NormalizedNote[]): { updated: number; inserted: number } {
        const insertStmt = db.prepare(`
            INSERT INTO note_stats (note_id, title, cover_image, views, likes, comments, collects, shares, publish_date, account_id, xsec_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateStmt = db.prepare(`
            UPDATE note_stats
            SET title = ?, cover_image = ?, views = ?, likes = ?, comments = ?, collects = ?, shares = ?,
                publish_date = COALESCE(?, publish_date), xsec_token = COALESCE(?, xsec_token),
                record_date = CURRENT_TIMESTAMP
            WHERE note_id = ? AND account_id = ?
        `);

        const historyStmt = db.prepare(`
            INSERT INTO note_stats_history (note_id, account_id, views, likes, comments, collects, shares)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        let updated = 0;
        let inserted = 0;

        const transaction = db.transaction((items: NormalizedNote[]) => {
            for (const note of items) {
                const existing = db.prepare('SELECT * FROM note_stats WHERE note_id = ? AND account_id = ?')
                    .get(note.note_id, this.accountId) as any;

                if (existing) {
                    const merged = this.mergeWithExisting(note, existing);
                    updateStmt.run(
                        merged.title || existing.title,
                        merged.cover_image || existing.cover_image,
                        merged.views,
                        merged.likes,
                        merged.comments,
                        merged.collects,
                        merged.shares,
                        merged.publish_date || null,
                        merged.xsec_token || null,
                        note.note_id,
                        this.accountId
                    );
                    updated++;
                    historyStmt.run(note.note_id, this.accountId, merged.views, merged.likes, merged.comments, merged.collects, merged.shares);
                } else {
                    if (note.title && note.title !== 'Untitled') {
                        insertStmt.run(
                            note.note_id,
                            note.title,
                            note.cover_image,
                            note.views,
                            note.likes,
                            note.comments,
                            note.collects,
                            note.shares,
                            note.publish_date || null,
                            this.accountId,
                            note.xsec_token || null
                        );
                        inserted++;
                        historyStmt.run(note.note_id, this.accountId, note.views, note.likes, note.comments, note.collects, note.shares);
                    }
                }
            }
        });

        transaction(notes);
        Logger.info('RPA:Stats', `Persist complete. Updated: ${updated}, Inserted: ${inserted}`);
        return { updated, inserted };
    }

    /**
     * 功能描述：合并新数据与已有数据
     *
     * 设计思路：
     * - API 数据优先级最高，允许覆盖为 0（接口明确返回）
     * - DOM 兜底数据遇到 0 时，保留已有正数
     * - 标题、封面、发布时间等非数值字段优先使用新数据
     */
    private mergeWithExisting(note: NormalizedNote, existing: any): NormalizedNote {
        const isApi = note._source === 'GALAXY_API' || note._source === 'NETWORK_INTERCEPT';

        const pick = (newVal: number, oldVal: number) => {
            if (isApi) return newVal;
            // DOM 兜底：0 不覆盖历史高值
            return (newVal === 0 && oldVal > 0) ? oldVal : newVal;
        };

        return {
            ...note,
            title: note.title || existing.title || 'Untitled',
            cover_image: note.cover_image || existing.cover_image,
            views: pick(note.views, existing.views || 0),
            likes: pick(note.likes, existing.likes || 0),
            comments: pick(note.comments, existing.comments || 0),
            collects: pick(note.collects, existing.collects || 0),
            shares: pick(note.shares, existing.shares || 0),
            publish_date: note.publish_date || existing.publish_date,
            xsec_token: note.xsec_token || existing.xsec_token
        };
    }
}

/**
 * 功能描述：抓取当前活跃账号的笔记统计数据
 *
 * 设计思路：
 * 1. 前置检查活跃账号与 Cookie
 * 2. 进入创作者中心并校验登录态
 * 3. 优先调用 Galaxy API 分页获取全部笔记
 * 4. 若 API 数据不足，启动 DOM 兜底
 * 5. 合并数据并持久化
 *
 * 参数说明：
 * - taskId: [string | undefined] 异步任务 ID，用于截图与日志
 *
 * 返回说明：
 * - { success: boolean; count: number; updated: number; inserted: number }
 *
 * 异常情况：
 * - NO_ACTIVE_ACCOUNT: 未绑定活跃账号
 * - COOKIE_EXPIRED: 缺少创作者中心 Cookie 或登录态失效
 */
export async function scrapeNoteStats(taskId?: string) {
    // 0. 前置检查
    const activeAccount = db.prepare(
        'SELECT id, creator_cookies, main_site_cookies, cookies FROM accounts WHERE is_active = 1 LIMIT 1'
    ).get() as { id: number; creator_cookies?: string; main_site_cookies?: string; cookies?: string } | undefined;

    if (!activeAccount) {
        throw new Error('NO_ACTIVE_ACCOUNT: 请先在账号矩阵中绑定并激活一个小红书账号');
    }

    const hasCreatorCookie = !!(activeAccount.creator_cookies || activeAccount.cookies);
    if (!hasCreatorCookie) {
        throw new Error('COOKIE_EXPIRED: 创作者中心 Cookie 缺失，请在账号矩阵中重新授权“创作发布权限”');
    }

    // 1. 获取已认证页面
    const session = await BrowserService.getInstance().getAuthenticatedPage('CREATOR', true);
    const { page } = session;

    try {
        await takeProgressScreenshot(page, taskId);

        // 2. 提前注册 Galaxy API 响应监听器（必须在 page.goto 前注册才能捕获首屏）
        const galaxyClient = new GalaxyApiClient(page, 2000);
        galaxyClient.registerListener();

        // 3. 导航到创作者中心并校验登录态
        await page.goto('https://creator.xiaohongshu.com/creator/home', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        if (page.url().includes('/login')) {
            throw new Error('COOKIE_EXPIRED: 创作中心登录已过期，请重新绑定“创作发布权限”');
        }
        await takeProgressScreenshot(page, taskId);

        // 4. 导航到笔记管理页，让页面自己发出 Galaxy API 请求
        await page.goto('https://creator.xiaohongshu.com/new/note-manager', { waitUntil: 'domcontentloaded' });
        await takeProgressScreenshot(page, taskId);

        // 5. 从监听的响应中提取全部笔记
        let notes = await galaxyClient.fetchAllNotes();

        // 6. 若 API 数据明显不足，启动 DOM 兜底
        const notesBeforeDom = notes.length;
        if (notes.length < 5) {
            Logger.warn('RPA:Stats', `Galaxy API returned only ${notes.length} notes, triggering DOM fallback`);
            const domNotes = await new DomFallbackScraper(page).scrape();

            const mergedMap = new Map<string, NormalizedNote>();
            for (const n of notes) mergedMap.set(n.note_id, n);
            for (const n of domNotes) {
                if (!mergedMap.has(n.note_id)) {
                    mergedMap.set(n.note_id, n);
                }
            }
            notes = Array.from(mergedMap.values());
        }

        Logger.info('RPA:Stats', `Total notes to persist: ${notes.length} (Galaxy: ${notesBeforeDom})`);

        // 6. 同步用户 ID 到账号表（便于后续打开笔记）
        try {
            const userState = await page.evaluate(() => (window as any).__INITIAL_STATE__);
            const userId = userState?.user?.user?.userId || userState?.user?.user_id || userState?.user?.id;
            if (userId) {
                AccountService.updateUserId(activeAccount.id, userId);
            }
        } catch (_e) {
            // 用户 ID 同步失败不影响主流程
        }

        // 7. 数据质量校验：必须包含笔记 ID 和标题
        const validNotes = notes.filter(n => n.note_id && n.title && n.title !== 'Untitled');
        if (validNotes.length === 0) {
            throw new Error('INVALID_SCRAPE_DATA: 未能从创作者中心解析到有效笔记数据，请检查账号状态或小红书页面变更');
        }

        // 8. 持久化
        const { updated, inserted } = new NoteStatsRepository(activeAccount.id).save(validNotes);

        return {
            success: true,
            count: validNotes.length,
            updated,
            inserted
        };
    } catch (e: any) {
        Logger.error('RPA:Stats', `Scrape failed: ${e.message}`, e);
        try {
            if (page && !page.isClosed()) {
                await Logger.saveScreenshot(page, 'scrape-failed');
                await takeProgressScreenshot(page, taskId);
            }
        } catch (_screenshotErr) {
            // 截图失败时忽略
        }
        throw e;
    } finally {
        try {
            if (page && !page.isClosed()) await page.close();
        } catch (_e) {
            // 页面可能已关闭
        }
    }
}
