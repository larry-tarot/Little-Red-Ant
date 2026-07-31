
import { BrowserService } from './BrowserService.js';
import db from '../../db.js';
import { Logger } from '../LoggerService.js';
import fs from 'fs';
import path from 'path';
import { AccountService } from '../core/AccountService.js';
import { CommentAnalysisService } from '../ai/CommentAnalysisService.js';
import { RPAUtils } from './utils/RPAUtils.js';
import { SettingsService } from '../SettingsService.js';
import { requireActiveAccount } from './auth.js';

// Safety Configuration
const SAFETY_CONFIG = {
    MAX_ACTIONS_PER_MINUTE: 5,
    MIN_DELAY_MS: 3000,
    MAX_DELAY_MS: 8000,
    DAILY_REPLY_LIMIT: 30
};

/**
 * 功能描述：检查当前页面是否因登录态失效被重定向到登录页
 *
 * 参数说明：
 * - page: any Playwright 页面实例
 * - context: string 当前操作描述，用于日志
 *
 * 返回说明：
 * - void 页面正常时无返回值
 *
 * 异常情况：
 * - COOKIE_EXPIRED: 页面被重定向到登录页或出现登录相关元素
 */
async function assertNotLoginPage(page: any, context: string): Promise<void> {
    try {
        const href = page.url();
        const isLoginUrl = href.includes('/login') || href.includes('/sign');
        const isLoginPage = await page.evaluate(() => {
            const pageText = document.body ? document.body.innerText : '';
            const hasPhoneInput = !!document.querySelector('input[placeholder*="手机号"]');
            const hasLoginText = pageText.includes('手机号登录') || pageText.includes('验证码登录') || pageText.includes('登录');
            return hasPhoneInput || hasLoginText;
        });

        if (isLoginUrl || isLoginPage) {
            Logger.warn('RPA:Comments', `${context}: redirected to login page (${href})`);
            throw new Error('COOKIE_EXPIRED: Session expired, please re-authorize in Account Matrix');
        }
    } catch (e: any) {
        // 避免将判定本身的异常吞掉
        if (e.message && e.message.includes('COOKIE_EXPIRED')) throw e;
        Logger.warn('RPA:Comments', `Failed to check login state: ${e.message}`);
    }
}

const delay = (min = SAFETY_CONFIG.MIN_DELAY_MS, max = SAFETY_CONFIG.MAX_DELAY_MS) => 
    new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1) + min)));

export async function scrapeComments(targetNoteId?: string) {
    // 0. 前置检查：评论/通知中心必须依赖小红书主站登录态
    requireActiveAccount('MAIN_SITE');

    // 1. Get Authenticated Page (MAIN_SITE only)
    // 评论、@、通知均位于 www.xiaohongshu.com，必须使用主站 Cookie。
    const session = await BrowserService.getInstance().getAuthenticatedPage('MAIN_SITE', true); // Headless for background operation

    const { _browser, page } = session;
    
    // Inject polyfills for environment compatibility
    await RPAUtils.initPage(page);

    // Debug file path
    const debugPath = path.join(process.cwd(), 'data', 'debug_comments_network.json');
    const debugHtmlPath = path.join(process.cwd(), 'data', 'debug_comments_page.html');
    const debugData: any[] = [];
    let responseHandler: ((response: any) => void) | undefined;

    try {
        if (targetNoteId) {
             Logger.info('RPA:Comments', `Navigating to specific note ${targetNoteId} to monitor comments...`);
        } else {
             Logger.info('RPA:Comments', 'Navigating to Notification Center...');
        }

        // 2. Setup API Interception
        // Store ALL fetched items, not just the last page
        const allCapturedItems: any[] = [];
        const SEVEN_DAYS_AGO = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        responseHandler = (response: any) => {
            const url = response.url();
            const method = response.request().method();
            if (method !== 'GET' && method !== 'POST') return;

            // 拦截与评论/通知相关的 API，同时排除容易混入噪音的 feed/social 端点。
            // 小红书通知中心常见路径：/message、/notice、/mention、/notification、/comment
            const lowerUrl = url.toLowerCase();
            const isCommentOrNotification =
                (lowerUrl.includes('comment') ||
                    lowerUrl.includes('message') ||
                    lowerUrl.includes('mention') ||
                    lowerUrl.includes('notice') ||
                    lowerUrl.includes('notification') ||
                    lowerUrl.includes('/msg') ||
                    lowerUrl.includes('/at')) &&
                !lowerUrl.includes('/feed') &&
                !lowerUrl.includes('/social') &&
                !lowerUrl.includes('/inbox') &&
                !lowerUrl.includes('/recommend') &&
                !lowerUrl.includes('/explore') &&
                !lowerUrl.includes('/im/');

            if (!isCommentOrNotification) return;
            if (response.status() >= 400) return;

            response.json().then((json: any) => {
                // 保存到调试日志（最多保留 100 条）
                debugData.push({ url, data: json, time: new Date().toISOString() });
                if (debugData.length > 100) debugData.shift();

                const dataRoot = json.data || {};
                const candidates: any[] = [];

                // 兼容多种可能的数据结构
                for (const key of ['messages', 'message_list', 'comments', 'items', 'list', 'data']) {
                    const arr = dataRoot[key];
                    if (Array.isArray(arr)) candidates.push(...arr);
                }
                if (Array.isArray(dataRoot)) candidates.push(...dataRoot);

                if (candidates.length > 0) {
                    Logger.info('RPA:Comments', `Captured ${candidates.length} items from ${url.split('?')[0].slice(-40)}`);
                    allCapturedItems.push(...candidates);
                }
            }).catch(() => {
                // Ignore non-JSON responses
            });
        };
        
        page.on('response', responseHandler);

        // 3. Navigation & Interaction
        if (targetNoteId) {
            // Navigate to Note Detail Page
            // Try different URL formats: /explore/id or /discovery/item/id
            await page.goto(`https://www.xiaohongshu.com/explore/${targetNoteId}`, { waitUntil: 'domcontentloaded' });
            await assertNotLoginPage(page, 'Note detail');
            await delay(3000);
            
            // Open comment section if needed (usually open by default on web, but good to ensure)
            // On web, comments are below content. We need to scroll down.
        } else {
            // Default: Notification Center
            await page.goto('https://www.xiaohongshu.com/notification', { waitUntil: 'domcontentloaded' });
            await assertNotLoginPage(page, 'Notification center');
            await delay(3000);

            // Click "Comments and @" tab
            // 小红书通知中心标签文案可能为："评论和@" / "评论" / "评论和@我" / "互动"
            try {
                const tabSelectors = [
                    { hasText: /^评论和@$/ },
                    { hasText: /^评论和@我$/ },
                    { hasText: /^评论$/ },
                    { hasText: /^互动$/ },
                    { hasText: /^评论\s*\/?\s*@$/ }
                ];
                let clicked = false;
                for (const filter of tabSelectors) {
                    const commentTab = page.locator('div, span, li, a, button').filter(filter).first();
                    const visible = await commentTab.isVisible().catch(() => false);
                    if (visible) {
                        await commentTab.click();
                        clicked = true;
                        const label = (filter as any).hasText?.source || JSON.stringify(filter);
                        Logger.info('RPA:Comments', `Clicked comment tab matching ${label}`);
                        await delay(2000);
                        break;
                    }
                }

                if (!clicked) {
                    // Fallback logic: 尝试第二个频道标签
                    const channelSelectors = [
                        '.channel-list .channel-item',
                        '.tab-list .tab-item',
                        '[class*="channel-list"] > *',
                        '[class*="tab-list"] > *'
                    ];
                    for (const sel of channelSelectors) {
                        const tabs = page.locator(sel);
                        const count = await tabs.count();
                        if (count >= 2) {
                            await tabs.nth(1).click();
                            clicked = true;
                            Logger.info('RPA:Comments', `Fallback clicked second tab via ${sel}`);
                            await delay(2000);
                            break;
                        }
                    }
                }

                if (!clicked) {
                    Logger.warn('RPA:Comments', 'Could not find comment tab, will capture all notification APIs');
                }
            } catch(_e: any) {
                Logger.warn('RPA:Comments', `Tab click failed: ${_e.message}`);
            }
        }

        // 3.1 Scroll Loop for 7 Days of Data
        Logger.info('RPA:Comments', 'Starting scroll loop to fetch 7 days of history...');
        let noNewDataCount = 0;
        let lastUniqueCount = 0;
        const seenIdsDuringScroll = new Set<string>();

        /**
         * 更新已见 ID 集合并返回当前唯一数量
         *
         * 设计思路：同一接口可能被多次触发（重试/预加载），用 raw length 判断
         * 是否拿到新数据不可靠，改用以 ID 去重后的唯一数量。
         */
        const updateUniqueCount = () => {
            let changed = false;
            for (const item of allCapturedItems) {
                const parsed = parseCommentItem(item);
                if (parsed && parsed.id && !seenIdsDuringScroll.has(parsed.id)) {
                    seenIdsDuringScroll.add(parsed.id);
                    changed = true;
                }
            }
            return { count: seenIdsDuringScroll.size, changed };
        };

        // Limit max scrolls to prevent infinite loops (e.g. 20 pages ~ 400 items)
        for (let i = 0; i < 20; i++) {
            const unique = updateUniqueCount();

            // Check if we have data older than 7 days
            if (allCapturedItems.length > 0) {
                // Find the oldest item time
                // Note: items are usually sorted new -> old
                const oldestItem = allCapturedItems[allCapturedItems.length - 1];
                let itemTime = 0;
                if (oldestItem.time) itemTime = oldestItem.time * 1000;

                if (itemTime > 0 && itemTime < SEVEN_DAYS_AGO) {
                    Logger.info('RPA:Comments', 'Reached 7 days history limit. Stopping scroll.');
                    break;
                }
            }

            if (unique.count === lastUniqueCount) {
                noNewDataCount++;
            } else {
                noNewDataCount = 0; // Reset if we got new data
            }

            lastUniqueCount = unique.count;

            if (noNewDataCount >= 3) {
                Logger.info('RPA:Comments', `No new unique data after 3 scrolls (unique=${unique.count}). Stopping.`);
                break;
            }

            // Scroll down naturally
            // Strategy: Hybrid approach (JS Smooth Scroll + Mouse Wheel)
            // This ensures VISIBLE scrolling (user feedback) and Event triggering (lazy load)
            Logger.info('RPA:Comments', `Scroll #${i + 1} (Hybrid Smooth Scroll)...`);
            
            try {
                // 1. JS Smooth Scroll (Visual & Reliable)
                // We try to find the actual scrollable container first
                await page.evaluate(() => {
                    const scrollAmount = 800;
                    
                    // Heuristic: Find the largest visible element that has scrollable overflow
                    let target: Element | Window = window;
                    let maxArea = 0;
                    
                    const candidates = Array.from(document.querySelectorAll('div, section, main, ul'));
                    for (const el of candidates) {
                        const style = window.getComputedStyle(el);
                        const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
                        
                        if (isScrollable) {
                            const rect = el.getBoundingClientRect();
                            // Must be visible
                            if (rect.width > 0 && rect.height > 0) {
                                const area = rect.width * rect.height;
                                // Prefer larger areas (main content) over small ones (sidebars)
                                if (area > maxArea) {
                                    maxArea = area;
                                    target = el;
                                }
                            }
                        }
                    }
                    
                    // Execute Smooth Scroll
                    target.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                });
                
                // 2. Physical Mouse Wheel (Backup & Event Trigger)
                // Move mouse to "safe zone" (center-right) to avoid left sidebar
                const vp = page.viewportSize();
                if (vp) {
                    await page.mouse.move(vp.width * 0.6, vp.height * 0.5);
                    await delay(100);
                    await page.mouse.wheel(0, 600);
                }
                
            } catch (e: any) {
                Logger.warn('RPA:Comments', `Scroll failed: ${e.message}`);
            }
            
            Logger.info('RPA:Comments', `Total Captured Items so far: ${allCapturedItems.length}, unique: ${updateUniqueCount().count}`);

            // Wait for network and render
            await delay(2000, 4000);
        }

        // Write debug file
        if (!fs.existsSync(path.dirname(debugPath))) fs.mkdirSync(path.dirname(debugPath), { recursive: true });
        fs.writeFileSync(debugPath, JSON.stringify(debugData, null, 2));

        // 4. Data Extraction & Normalization
        let items: any[] = [];

        if (allCapturedItems.length > 0) {
            Logger.info('RPA:Comments', `Processing ${allCapturedItems.length} raw items from API`);

            // Deduplicate by ID
            const uniqueMap = new Map();

            allCapturedItems.forEach((item: any) => {
                const parsedItem = parseCommentItem(item);
                if (!parsedItem) return;

                // 保存前强制校验：缺少关键字段的数据不写入数据库
                if (!parsedItem.user_nickname || parsedItem.user_nickname === 'Unknown') {
                    Logger.warn('RPA:Comments', `Skipping item without valid user_nickname: ${JSON.stringify(parsedItem).slice(0, 200)}`);
                    return;
                }
                if (!parsedItem.content) {
                    Logger.warn('RPA:Comments', `Skipping item without content: id=${parsedItem.id}`);
                    return;
                }
                // root_note_id 不一定每条通知都有（例如系统通知、点赞通知），
                // 对于评论/@ 通知缺失时保留空字符串，不再整条丢弃。
                if (!parsedItem.root_note_id) {
                    Logger.info('RPA:Comments', `Keeping item without root_note_id: id=${parsedItem.id}`);
                    parsedItem.root_note_id = '';
                }

                uniqueMap.set(parsedItem.id, parsedItem);
            });

            items = Array.from(uniqueMap.values());
        }

        // Method B: DOM Scraping (Fallback)
        if (items.length === 0) {
            Logger.warn('RPA:Comments', 'API interception empty, using DOM Scraper');

            // Dump HTML for diagnosis
            const html = await page.content();
            if (!fs.existsSync(path.dirname(debugHtmlPath))) fs.mkdirSync(path.dirname(debugHtmlPath), { recursive: true });
            fs.writeFileSync(debugHtmlPath, html);

            items = await page.evaluate(() => {
                // Broadest possible selector for notification items
                const nodes = Array.from(document.querySelectorAll(
                    '.message-item, .notification-item, .item-container, ' +
                    '[class*="message-item"], [class*="notification-item"], ' +
                    '.msg-item, .comment-item, [class*="comment-item"], ' +
                    'div[class*="item"], li[class*="item"]'
                ));

                return nodes.map((el: any) => {
                    const text = el.innerText || '';
                    if (text.length < 5) return null; // Skip empty noise

                    // Basic extraction
                    const userEl = el.querySelector('.user-name, .nickname, .name, h4, [class*="name"], [class*="nickname"]');
                    const contentEl = el.querySelector('.content, .desc, .comment, p, [class*="content"], [class*="desc"]');
                    const imgEl = el.querySelector('img');

                    // Detect if it's a mention
                    const isMention = text.includes('@了你') || text.includes('提到了你') || text.includes('@你');

                    if (!userEl || !contentEl) return null;
                    if (text.includes('赞了') || text.includes('收藏了') || text.includes('关注了')) return null;

                    // 尝试从列表项里的链接解析笔记 ID
                    let rootNoteId = '';
                    const linkEl = el.querySelector('a[href*="/explore/"], a[href*="/discovery/item/"], a[href*="/item/"]');
                    if (linkEl) {
                        const href = linkEl.getAttribute('href') || '';
                        const match = href.match(/(?:explore|item|discovery\/item)\/([0-9a-f]{24})/i);
                        if (match) rootNoteId = match[1];
                    }

                    return {
                        user_nickname: userEl.innerText.trim(),
                        user_avatar: imgEl ? imgEl.src : '',
                        content: contentEl.innerText.trim(),
                        create_time_str: new Date().toISOString(), // 统一使用 ISO 格式
                        id: el.getAttribute('data-id') || `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        reply_status: 'UNREAD',
                        type: isMention ? 'MENTION' : 'COMMENT',
                        root_note_id: rootNoteId
                    };
                }).filter(i => i !== null);
            });
        }

        Logger.info('RPA:Comments', `Extracted ${items.length} items`);

        // 5. Save to DB
        if (items.length > 0) {
            const activeAccountId = AccountService.getActiveAccountId();
            
            if (!activeAccountId) {
                throw new Error('No active account found. Please activate an account in the Account Matrix first.');
            }

            const stmt = db.prepare(`
                INSERT INTO comments (id, note_id, user_nickname, user_avatar, content, create_time, reply_status, account_id, type, root_note_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    note_id=excluded.note_id,
                    reply_status=excluded.reply_status,
                    create_time=excluded.create_time,
                    type=excluded.type,
                    root_note_id=excluded.root_note_id
            `);

            const insertTransaction = db.transaction((comments: any[]) => {
                for (const item of comments) {
                    // Normalization
                    const id = item.id || `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    const nick = item.user_nickname || item.from_user?.nickname || 'Unknown';
                    const avatar = item.user_avatar || item.from_user?.images || '';
                    const content = item.content || item.target_note?.title || '';
                    const noteId = item.note_id || item.root_note_id || '';

                    stmt.run(id, noteId, nick, avatar, content, item.create_time_str, item.reply_status || 'UNREAD', activeAccountId, item.type || 'COMMENT', item.root_note_id || '');
                }
            });
            insertTransaction(items);
            
            // Trigger AI Analysis for newly added comments
            const autoReplyEnabled = await SettingsService.get('AUTO_REPLY_ENABLED');
            
            if (autoReplyEnabled === 'true') {
                Logger.info('RPA:Comments', 'Triggering AI analysis for new comments...');
                try {
                    // Get limit from settings, default to 20
                    const limitStr = await SettingsService.get('AI_ANALYSIS_LIMIT');
                    const limit = limitStr ? parseInt(limitStr, 10) : 20;

                    // Analyze up to [limit] unanalyzed comments
                    // We use setTimeout to run it in background after response
                    // But since we are in a worker or task context, better await it or let it run
                    await CommentAnalysisService.processUnanalyzedComments(limit);
                } catch (e: any) {
                    Logger.error('RPA:Comments', `AI Analysis failed: ${e.message}`);
                }
            } else {
                Logger.info('RPA:Comments', 'Auto Reply Analysis skipped (Disabled in Settings)');
            }
        }

        return { success: true, count: items.length };

    } catch (error: any) {
        Logger.error('RPA:Comments', `Scrape failed: ${error.message}`, error);
        throw error;
    } finally {
        if (page && responseHandler) {
            page.off('response', responseHandler);
            try { await page.close(); } catch(_e) { /* ignore */ }
        }
    }
}

export async function replyToComment(commentId: string, replyContent: string) {
    // 0. 前置检查：必须有已激活且具备主站/任意 Cookie 的账号
    requireActiveAccount('MAIN_SITE');

    // Safety Check: Sensitive Words
    const FORBIDDEN_WORDS = ['加v', '私', '微信号', '公众号', '代购', '淘宝', '天猫', '京东', '拼多多', '链接', 'http'];
    for (const word of FORBIDDEN_WORDS) {
        if (replyContent.includes(word)) {
            throw new Error(`Safety Violation: Reply contains forbidden word "${word}". Operation blocked.`);
        }
    }

    // [Change] Use Notification Center for replies to ensure consistency with scraping
    const session = await BrowserService.getInstance().getAuthenticatedPage('MAIN_SITE', true);
    const { _browser, page } = session;

    // Inject polyfills
    await RPAUtils.initPage(page);

    try {
        await page.goto('https://www.xiaohongshu.com/notification', { waitUntil: 'domcontentloaded' });
        await assertNotLoginPage(page, 'Reply notification center');
        await delay(3000);

        // Click "Comments and @" tab to filter view
        try {
            const commentTab = page.locator('div, span, li').filter({ hasText: /^评论和@$/ }).first();
            if (await commentTab.isVisible()) {
                await commentTab.click();
                await delay(2000);
            }
        } catch(_e) { /* ignore */ }
        
        Logger.info('RPA:Reply', `Locating comment ${commentId}...`);
        
        const comment = db.prepare('SELECT content, user_nickname FROM comments WHERE id = ?').get(commentId) as any;
        if (!comment) throw new Error('Comment not found in DB');

        // Strategy 1: Try ID match (if we scraped it from DOM data-id)
        let commentLocator = page.locator(`[data-id="${commentId}"]`).first();
        
        // Strategy 2: Text Content Match (Robust Fallback)
        if (await commentLocator.count() === 0) {
            Logger.info('RPA:Reply', 'ID match failed, trying text content match...');
            // Normalize content for matching (remove whitespace issues)
            const cleanContent = comment.content.trim().substring(0, 15); 
            
            // Find the Content Element first (most unique part)
            // We look for a generic text element containing the content
            const contentEl = page.locator(`:text("${cleanContent}")`).first();
            
            if (await contentEl.count() === 0) {
                 await Logger.saveScreenshot(page, 'reply-content-not-found');
                 throw new Error(`Could not find comment with text: ${cleanContent}`);
            }

            // Navigate up to find the Container (Card) that also has the User Nickname
            // We assume the card is within 6 levels up (HTML structure depth)
            // XPath: Find an ancestor div that contains the nickname
            // Note: xpath is 1-based.
            const cardXpath = `xpath=./ancestor::div[contains(., "${comment.user_nickname}")][1]`;
            commentLocator = contentEl.locator(cardXpath);
        }
        
        if (await commentLocator.count() === 0) {
             await Logger.saveScreenshot(page, 'reply-card-not-found');
             throw new Error('Comment container not found. (Pagination not yet supported)');
        }

        // Highlight the found card for visual debugging in screenshots
        await commentLocator.evaluate((el: any) => el.style.border = '3px solid red');
        await commentLocator.scrollIntoViewIfNeeded();
        await delay(1000);

        // 2. Check if Input is ALREADY Visible (e.g. previously clicked)
        // Heuristic: If there is a "取消" (Cancel) button, the input is likely open.
        const cancelButton = commentLocator.locator('button, div, span').filter({ hasText: /^取消$/ }).first();
        const isInputOpen = await cancelButton.isVisible().catch(() => false);
        
        let input = commentLocator.locator('textarea, [contenteditable="true"], [role="textbox"]').first();

        if (!isInputOpen) {
            // 3. Click Reply Button
            // We iterate through all elements containing "回复" and pick the one that is exactly "回复"
            // This avoids "回复了你的评论" or "回复中"
            
            const candidates = commentLocator.locator(':text("回复")');
            const count = await candidates.count();
            let replyBtn = null;

            for (let i = 0; i < count; i++) {
                const el = candidates.nth(i);
                const text = await el.innerText();
                if (text && text.trim() === '回复') {
                    // Double check it's not the status line (usually gray color, but hard to check in code)
                    // We assume the action button is clickable or has a specific role, 
                    // but simple text match is usually enough if length is strict.
                    replyBtn = el;
                    break;
                }
            }

            if (replyBtn) {
                 await replyBtn.click();
            } else {
                 // Try hovering first (sometimes buttons appear on hover)
                 await commentLocator.hover();
                 await delay(500);
                 
                 // Re-scan after hover
                 const candidatesAfterHover = commentLocator.locator(':text("回复")');
                 const countAfter = await candidatesAfterHover.count();
                 for (let i = 0; i < countAfter; i++) {
                    const el = candidatesAfterHover.nth(i);
                    const text = await el.innerText();
                    if (text && text.trim() === '回复') {
                        replyBtn = el;
                        break;
                    }
                 }
                 
                 if (replyBtn) {
                     await replyBtn.click();
                 } else {
                     await Logger.saveScreenshot(page, 'reply-btn-not-found');
                     throw new Error('Reply button not found (checked exact "回复" text)');
                 }
            }
            
            // Wait for input
            try {
                input = commentLocator.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
                await input.waitFor({ state: 'visible', timeout: 5000 });
            } catch (_e) {
                 await Logger.saveScreenshot(page, 'reply-input-timeout');
                 throw new Error('Input box did not appear after clicking reply');
            }
        } else {
            Logger.info('RPA:Reply', 'Input box already visible (found "取消" button)');
        }

        // 4. Type Content
        // Use pressSequentially to mimic human typing and ensure event listeners (React/Vue) trigger correctly
        await input.clear(); // Clear first just in case
        await input.pressSequentially(replyContent, { delay: 100 });
        await delay(1000);

        // 5. Submit
        Logger.info('RPA:Reply', 'Locating Submit button...');
        
        // Strategy: Search within the card for the button
        // We iterate through ALL candidates to find the one that is actually visible.
        // Relaxed regex to handle whitespace
        const submitCandidates = commentLocator.locator('button, div[role="button"], span').filter({ hasText: /^\s*发送\s*$/ });
        const candidateCount = await submitCandidates.count();
        let submitBtn = null;

        for (let i = 0; i < candidateCount; i++) {
            const btn = submitCandidates.nth(i);
            // Check visibility
            if (await btn.isVisible()) {
                submitBtn = btn;
                Logger.info('RPA:Reply', `Found visible Submit button at index ${i}`);
                break;
            }
        }

        if (submitBtn) {
            // Highlight it for user to see
            await submitBtn.evaluate((el: any) => el.style.border = '3px solid green');
            await delay(500); // Visual confirmation
            await submitBtn.click();
        } else {
            // Last Resort: Search GLOBALLY for a "发送" button that is visibly close to our input?
            // Or just fail. We should NOT press Enter as it causes newlines.
            await Logger.saveScreenshot(page, 'reply-submit-not-found');
            throw new Error('Submit button ("发送") not found in the card.');
        }
        
        // 6. Verify Submission
        await delay(2000);
        
        // Check if input is cleared or detached
        const isInputAttached = await input.isVisible().catch(() => false);
        if (isInputAttached) {
             const remainingText = await input.inputValue().catch(() => '');
             if (remainingText && remainingText.trim().length > 0) {
                 await Logger.saveScreenshot(page, 'reply-stuck');
                 throw new Error('Reply failed: Text still remains in input. Button click might have failed.');
             }
        }
        
        Logger.info('RPA:Reply', 'Reply submitted successfully (Input cleared)');
        await delay(3000, 5000);

        // Fix: Use single quotes for string literal in SQL
        db.prepare("UPDATE comments SET reply_status = 'REPLIED' WHERE id = ?").run(commentId);

        return { success: true };

    } catch (error: any) {
        Logger.error('RPA:Reply', `Reply failed: ${error.message}`, error);
        throw error;
    } finally {
        if (page) {
            try { await page.close(); } catch(_e) { /* ignore */ }
        }
    }
}

/**
 * 功能描述：从任意字符串中解析小红书笔记 ID
 *
 * 设计思路：
 * 小红书笔记链接常见格式：
 * - https://www.xiaohongshu.com/explore/65a1b2c3d4e5f6
 * - https://www.xiaohongshu.com/discovery/item/65a1b2c3d4e5f6
 * 也可能直接是 note_id（24 位十六进制字符串）。
 *
 * 参数说明：
 * - raw: [any] 可能是链接、ID 或其他数据
 *
 * 返回说明：
 * - string 解析到的 note_id；无法解析时返回空字符串
 */
function extractNoteId(raw: any): string {
    if (!raw) return '';

    // 1. 如果本身就是 24 位十六进制字符串，直接返回
    if (typeof raw === 'string' && /^[0-9a-f]{24}$/i.test(raw.trim())) {
        return raw.trim();
    }

    // 2. 从链接中匹配
    const text = String(raw);
    const match = text.match(/(?:explore|item|discovery\/item)\/([0-9a-f]{24})/i);
    if (match) return match[1];

    // 3. 兜底：尝试匹配任意 24 位十六进制
    const looseMatch = text.match(/([0-9a-f]{24})/i);
    if (looseMatch) return looseMatch[1];

    return '';
}

/**
 * 功能描述：从原始 API item 中通用解析评论/@ 数据
 *
 * 设计思路：
 * 小红书通知中心 API 结构多次变化，本函数尝试多条字段路径提取：
 * 1. 新版通知 item：item.user_info + item.comment_info + item.note_info
 * 2. 通用消息 item：item.from_user / item.user + item.content + item.target_note
 * 3. 评论详情 item：item.user + item.content + item.note_id
 * 4. 兜底：从 item.link / item.url / item.note_id 解析 root_note_id
 *
 * 参数说明：
 * - item: [any] API 返回的单条原始数据
 *
 * 返回说明：
 * - 标准化对象；如果无法解析出关键字段，返回 null
 */
function parseCommentItem(item: any): any | null {
    if (!item || typeof item !== 'object') return null;

    // 尝试提取时间戳（支持秒/毫秒/字符串）
    const rawTime = item.time ||
        item.create_time ||
        item.createTime ||
        item.timestamp ||
        item.pub_time ||
        item.publish_time ||
        item.display_time ||
        item.msg_time ||
        item.create_time_str;

    let time: number | null = null;
    if (typeof rawTime === 'number') {
        // 秒级时间戳转毫秒
        time = rawTime < 1e12 ? rawTime * 1000 : rawTime;
    } else if (typeof rawTime === 'string') {
        const parsed = new Date(rawTime).getTime();
        if (!isNaN(parsed)) time = parsed;
    }

    // 路径 1：新版通知中心（mention/comment、comment/comment）
    if (item.type === 'mention/comment' || item.type === 'comment/comment' || item.comment_info) {
        const userInfo = item.user_info || item.user || {};
        const commentInfo = item.comment_info || item.comment || {};
        const noteInfo = item.note_info || item.note || item.target_note || {};

        // 从多个可能位置提取笔记 ID
        const noteId =
            extractNoteId(commentInfo.note_id) ||
            extractNoteId(noteInfo.id) ||
            extractNoteId(noteInfo.note_id) ||
            extractNoteId(item.note_id) ||
            extractNoteId(item.target_note_id) ||
            extractNoteId(item.link) ||
            extractNoteId(item.url) ||
            '';

        return {
            user_nickname: userInfo.nickname || userInfo.user_name || userInfo.name || '',
            user_avatar: userInfo.image || userInfo.avatar || userInfo.images || '',
            content: commentInfo.content || item.content || item.title || '',
            create_time_str: time ? new Date(time).toISOString() : new Date().toISOString(),
            id: String(commentInfo.id || item.id || item.message_id || `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`),
            reply_status: 'UNREAD',
            type: item.type === 'mention/comment' ? 'MENTION' : 'COMMENT',
            root_note_id: noteId,
            note_id: noteId
        };
    }

    // 路径 2：通用消息结构
    const user = item.from_user || item.user || item.userInfo || item.user_info || {};
    const note = item.target_note || item.note_info || item.note || {};
    const content = item.content || item.comment?.content || item.title || item.desc || '';

    if (!content) return null;

    const noteId =
        extractNoteId(note.id) ||
        extractNoteId(note.note_id) ||
        extractNoteId(item.note_id) ||
        extractNoteId(item.target_note_id) ||
        extractNoteId(item.link) ||
        extractNoteId(item.url) ||
        '';

    return {
        user_nickname: user.nickname || user.user_name || user.name || '',
        user_avatar: user.images || user.avatar || user.image || '',
        content,
        create_time_str: time ? new Date(time).toISOString() : new Date().toISOString(),
        id: String(item.id || item.message_id || `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`),
        reply_status: 'UNREAD',
        type: item.type?.includes('mention') || content.includes('@') ? 'MENTION' : 'COMMENT',
        root_note_id: noteId,
        note_id: noteId
    };
}
