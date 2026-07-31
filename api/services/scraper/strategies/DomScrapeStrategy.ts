
import { Page } from 'playwright';
import { ScrapingStrategy, ScrapeResult } from './ScrapingStrategy.js';
import { Logger } from '../../LoggerService.js';
import { DataSanitizer } from '../../../utils/DataSanitizer.js';
import { extractProfileFromDomScript } from '../utils/ProfileExtractor.js';

/**
 * 功能描述：当 API 拦截失败时，通过 DOM 解析抓取竞品笔记
 *
 * 设计思路：
 * 1. 多次滚动加载更多笔记
 * 2. 优先从 __INITIAL_STATE__ 读取用户资料
 * 3. 使用精确选择器匹配现代版小红书页面结构
 * 4. 提取标题、点赞、封面、链接等字段
 * 5. 可配置最大抓取条数，避免无限滚动
 */
export class DomScrapeStrategy implements ScrapingStrategy {
    // 最大滚动次数和每次滚动距离
    private maxScrolls = 8;
    private scrollDistance = 1200;
    private maxNotes = 100;

    async execute(page: Page, userId: string, signal?: AbortSignal): Promise<ScrapeResult | null> {
        Logger.info('RPA:Strategy:DOM', `Executing DOM scraping for ${userId}`);

        // 前置校验：必须在正确的用户主页上执行，避免在登录页/错误页提取垃圾数据
        const pageUrl = page.url();
        if (!pageUrl.includes(`/user/profile/${userId}`)) {
            Logger.warn('RPA:Strategy:DOM', `Unexpected URL ${pageUrl}, skipping DOM extraction`);
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
            Logger.warn('RPA:Strategy:DOM', `Page is invalid (login/notFound/blocked), skipping extraction`);
            return null;
        }

        try {
            // 多次滚动，随机等待，模拟真实用户
            let lastHeight = 0;
            let noChangeCount = 0;

            for (let i = 0; i < this.maxScrolls; i++) {
                if (signal?.aborted) {
                    Logger.info('RPA:Strategy:DOM', 'Cancel signal received, stopping scroll');
                    break;
                }

                await page.evaluate((distance) => window.scrollBy(0, distance), this.scrollDistance);
                await page.waitForTimeout(1200 + Math.floor(Math.random() * 800));

                const currentHeight = await page.evaluate(() => document.body.scrollHeight);
                if (currentHeight === lastHeight) {
                    noChangeCount++;
                    // 连续两次高度没变，认为已到底
                    if (noChangeCount >= 2) break;
                } else {
                    noChangeCount = 0;
                    lastHeight = currentHeight;
                }
            }
        } catch (e: any) {
            Logger.warn('RPA:Strategy:DOM', `Scroll failed: ${e.message}`);
        }

        // 使用共享的 DOM 提取脚本（包含 __INITIAL_STATE__、精确选择器、保守兜底）
        const info = await page.evaluate<any>(extractProfileFromDomScript());

        Logger.info(
            'RPA:Strategy:DOM',
            `Debug: nameFound=${info.debug?.nameFound}, avatarFound=${info.debug?.avatarFound}, ` +
            `initialFans=${info.debug?.initialFans}, domFans=${info.debug?.domFans}`
        );

        // 提取笔记列表
        const rawNotes = await this.extractNotes(page);

        // 标准化笔记字段：如果 DOM 能拿到评论/收藏/阅读数就使用，否则兜底为 0
        const normalizedNotes = rawNotes.map((n: any) => {
            const noteId = n.note_id || this.extractNoteId(n.url);
            return {
                note_id: noteId,
                title: DataSanitizer.sanitizeText(n.title, 100),
                likes: DataSanitizer.parseCount(n.likesRaw),
                comments: DataSanitizer.parseCount(n.commentsRaw),
                collects: DataSanitizer.parseCount(n.collectsRaw),
                views: DataSanitizer.parseCount(n.viewsRaw),
                cover: DataSanitizer.normalizeUrl(n.cover),
                url: n.url,
                publish_date: n.publish_date ? new Date(n.publish_date).toISOString() : null
            };
        });

        Logger.info(
            'RPA:Strategy:DOM',
            `Extracted ${info.nickname || '(unknown)'} with ${normalizedNotes.length} notes`
        );

        if (!info.nickname && normalizedNotes.length === 0) {
            Logger.warn('RPA:Strategy:DOM', 'DOM scraping failed: no valid data extracted');
            return null;
        }

        return {
            info: {
                nickname: info.nickname,
                avatar: info.avatar,
                desc: info.desc,
                stats: info.stats,
                fans_count: info.fans_count,
                notes_count: info.notes_count,
                likes_count: info.likes_count
            },
            notes: normalizedNotes,
            source: 'DOM'
        };
    }

    /**
     * 功能描述：从页面 DOM 提取笔记列表
     *
     * 设计思路：
     * - 优先从 __INITIAL_STATE__ 读取 notes 数组
     * - 兜底使用多种选择器匹配笔记卡片
     */
    private async extractNotes(page: Page): Promise<any[]> {
        return await page.evaluate(new Function(`
            const notes = [];

            // 1. Try __INITIAL_STATE__ first
            try {
                const state = window.__INITIAL_STATE__;
                if (state && state.user && state.user.userPageData && Array.isArray(state.user.userPageData.notes)) {
                    const domNotes = state.user.userPageData.notes;
                    for (const n of domNotes) {
                        const noteId = n.note_id || n.id;
                        if (!noteId) continue;

                        const interact = n.interact_info || n.interaction_info || n.interact || n.counts || {};
                        notes.push({
                            note_id: noteId,
                            title: n.display_title || n.title || '',
                            likesRaw: n.likes ?? n.like_count ?? interact.liked_count ?? interact.likedCount ?? interact.likes ?? '0',
                            commentsRaw: n.comments_count ?? n.comment_count ?? interact.comment_count ?? interact.commentCount ?? interact.comments ?? '0',
                            collectsRaw: n.collected_count ?? n.collect_count ?? interact.collected_count ?? interact.collectedCount ?? interact.collect_count ?? interact.collects ?? '0',
                            viewsRaw: n.view_count ?? n.read_count ?? interact.view_count ?? interact.viewCount ?? interact.views ?? '0',
                            cover: n.cover?.url_default || n.cover?.url_pre || n.cover?.url || n.cover_url || '',
                            url: 'https://www.xiaohongshu.com/explore/' + noteId,
                            publish_date: n.last_update_time || n.time || n.create_time || n.publish_time || null
                        });
                    }
                }
            } catch (_e) { /* ignore */ }

            // 2. DOM fallback if SSR data missing or empty
            if (notes.length === 0) {
                const noteSelectors = [
                    '.note-item', '.feed-item', 'section[class*="note-item"]',
                    '[class*="note-card"]', '[class*="feed-card"]',
                    '.user-note-item', '.explore-item',
                    '[class*="feeds-page"] [class*="note"]'
                ];
                let noteEls = [];
                for (const sel of noteSelectors) {
                    noteEls = document.querySelectorAll(sel);
                    if (noteEls.length > 0) break;
                }

                for (let i = 0; i < noteEls.length && i < ${this.maxNotes}; i++) {
                    const el = noteEls[i];
                    const titleSelectors = ['.title', '.note-title', '.footer .title', '[class*="title"]'];
                    let titleEl = null;
                    for (const sel of titleSelectors) {
                        titleEl = el.querySelector(sel);
                        if (titleEl && titleEl.innerText.trim()) break;
                    }

                    const likeSelectors = ['.like-count', '.likes', '.count', '.footer .like-wrapper', '[class*="like"]'];
                    let likeEl = null;
                    for (const sel of likeSelectors) {
                        likeEl = el.querySelector(sel);
                        if (likeEl) break;
                    }

                    // 尝试从卡片内文本按关键词提取评论/收藏/阅读数
                    const cardText = el.innerText || '';
                    const parseNumFromText = (keywords) => {
                        for (const kw of keywords) {
                            const idx = cardText.indexOf(kw);
                            if (idx >= 0) {
                                const after = cardText.substring(idx + kw.length, idx + kw.length + 20);
                                // 模板字符串中的反斜杠需要双写，才能在下发到浏览器执行时保持正则语义
                                const m = after.match(/(\\d+(?:\\.\\d+)?)\\s*[万w]?/);
                                if (m) {
                                    let num = parseFloat(m[1]);
                                    if (after.includes('万') || after.includes('w')) num *= 10000;
                                    return String(Math.round(num));
                                }
                            }
                        }
                        return '0';
                    };
                    const commentsRaw = parseNumFromText(['评论', '回帖', '留言']);
                    const collectsRaw = parseNumFromText(['收藏', '星标']);
                    const viewsRaw = parseNumFromText(['阅读', '浏览', '观看']);

                    let coverUrl = '';
                    const coverSelectors = ['.cover', '.note-cover', '[class*="cover"]', '[class*="image"]'];
                    for (const sel of coverSelectors) {
                        const coverDiv = el.querySelector(sel);
                        if (coverDiv) {
                            const style = coverDiv.style.backgroundImage;
                            if (style && style.includes('url')) {
                                const match = style.match(/url\\(['"]?(.*?)['"]?\\)/);
                                if (match) {
                                    coverUrl = match[1];
                                    break;
                                }
                            }
                        }
                    }
                    if (!coverUrl) {
                        const img = el.querySelector('img');
                        if (img) coverUrl = img.src;
                    }
                    if (coverUrl && coverUrl.startsWith('data:image')) {
                        coverUrl = '';
                    }

                    if (titleEl) {
                        const linkEl = el.querySelector('a');
                        let url = linkEl ? linkEl.href : '';
                        if (url && !url.startsWith('http')) {
                            url = 'https://www.xiaohongshu.com' + url;
                        }
                        notes.push({
                            title: titleEl.innerText.trim(),
                            likesRaw: likeEl ? likeEl.innerText.trim() : '0',
                            commentsRaw,
                            collectsRaw,
                            viewsRaw,
                            cover: coverUrl,
                            url: url,
                            publish_date: null
                        });
                    }
                }
            }

            return notes;
        `) as any);
    }

    /**
     * 功能描述：从笔记 URL 中提取 note_id
     */
    private extractNoteId(url: string): string | null {
        if (!url) return null;
        // 小红书笔记 ID 为 24 位十六进制字符串
        const match = url.match(/\/explore\/([0-9a-f]{24})/i);
        return match ? match[1] : null;
    }
}
