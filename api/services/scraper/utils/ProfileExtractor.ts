import { DataSanitizer } from '../../../utils/DataSanitizer.js';

export interface ProfileInfo {
    nickname: string;
    avatar: string;
    desc: string;
    stats: string;
    fans_count: number;
    notes_count: number;
    likes_count: number;
}

/**
 * 功能描述：从页面 DOM / __INITIAL_STATE__ 中提取小红书用户资料
 *
 * 设计思路：
 * 1. 优先读取 window.__INITIAL_STATE__（SSR 注入的完整用户数据）
 * 2. 再按优先级使用精确选择器匹配现代版页面结构
 * 3. 最后用保守的文本兜底，避免把笔记互动数错当成粉丝数
 * 4. 对提取到的数字做合理性校验，过滤明显错误的值
 */
export function extractProfileFromDomScript(): string {
    return `
        (function() {
            const parseNum = function(text) {
                if (!text) return 0;
                if (typeof text === 'number') return text;
                text = String(text).trim().toLowerCase();
                if (text.includes('万') || text.includes('w')) {
                    const num = parseFloat(text.replace(/[^\\d.]/g, ''));
                    return isNaN(num) ? 0 : Math.floor(num * 10000);
                }
                return parseInt(text.replace(/[^\\d]/g, ''), 10) || 0;
            };

            const cleanNum = function(text) {
                if (!text) return 0;
                if (typeof text === 'number') return text;
                return parseNum(String(text));
            };

            // 1. Try __INITIAL_STATE__ first
            let initialFans = 0, initialNotes = 0, initialLikes = 0;
            let initialNickname = '', initialAvatar = '', initialDesc = '';
            try {
                const state = window.__INITIAL_STATE__;
                if (state && state.user && state.user.userPageData) {
                    const userData = state.user.userPageData;
                    const userInfo = userData.basicInfo || userData.userInfo || {};
                    const interactions = userData.interactions || userInfo.interactions || [];

                    initialNickname = userInfo.nickname || '';
                    initialAvatar = userInfo.image || userInfo.avatar || '';
                    initialDesc = userInfo.desc || '';

                    // Interactions array: [{ count: '1.2万', name: '粉丝' }, ...]
                    if (Array.isArray(interactions)) {
                        interactions.forEach(function(item) {
                            const name = (item.name || item.type || '').toString();
                            const count = item.count || item.num || item.value || '0';
                            if (/粉丝/.test(name)) initialFans = cleanNum(count);
                            if (/笔记/.test(name)) initialNotes = cleanNum(count);
                            if (/获赞|赞与收藏/.test(name)) initialLikes = cleanNum(count);
                        });
                    }

                    // Fallback object fields
                    if (!initialFans) initialFans = cleanNum(userInfo.fans || userInfo.fans_number || userInfo.follower_count || userInfo.follows);
                    if (!initialNotes) initialNotes = cleanNum(userInfo.note_count || userInfo.notes_count || userInfo.total_notes || userInfo.post_count);
                    if (!initialLikes) initialLikes = cleanNum(userInfo.collected_count || userInfo.likes_count || userInfo.total_liked || userInfo.total_likes);
                }
            } catch (_e) { /* ignore SSR errors */ }

            // 2. DOM-based extraction with strict selectors
            const textOf = function(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; };

            const queryOne = function(selectors) {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && textOf(el)) return el;
                }
                return null;
            };

            const nameEl = queryOne([
                '.user-info-panel .name',
                '.user-basic-info .name',
                '.user-name',
                '.user-nickname',
                '.profile-header h1',
                'h1[class*="name"]',
                '[class*="user-info"] [class*="nickname"]',
                '[class*="user-name"]'
            ]);

            const avatarEl = queryOne([
                '.user-info-panel img',
                '.user-avatar img',
                '.avatar img',
                '.header-avatar img',
                '[class*="avatar"] img'
            ]);

            const descEl = queryOne([
                '.user-info-panel .desc',
                '.user-desc',
                '.desc',
                '.user-intro',
                '.intro',
                '[class*="user-info"] [class*="desc"]'
            ]);

            // 3. Stats extraction: prefer elements inside user info panel / profile header
            const domStats = { fans: 0, notes: 0, likes: 0 };
            const statsFound = { fans: false, notes: false, likes: false };

            // Modern XHS profile structure: stats are often in the header panel
            const statContainers = Array.from(document.querySelectorAll(
                '.user-info-panel [class*="data"], .user-info-panel [class*="stat"], ' +
                '.profile-header [class*="data"], .profile-header [class*="stat"], ' +
                '.user-interactions, [class*="user-interactions"], ' +
                '[class*="info-content"] [class*="data"]'
            ));

            for (const container of statContainers) {
                const items = container.querySelectorAll('div, span, a, p');
                for (const item of items) {
                    const text = textOf(item);
                    if (!text) continue;

                    // Match "12.3万 粉丝" or "粉丝 12.3万"
                    const fansMatch = text.match(/([\\d.,]+[\\w万]?)\\s*粉丝|粉丝\\s*([\\d.,]+[\\w万]?)/);
                    const notesMatch = text.match(/([\\d.,]+[\\w万]?)\\s*笔记|笔记\\s*([\\d.,]+[\\w万]?)/);
                    const likesMatch = text.match(/([\\d.,]+[\\w万]?)\\s*(获赞|赞与收藏)|(获赞|赞与收藏)\\s*([\\d.,]+[\\w万]?)/);

                    if (fansMatch && !statsFound.fans) {
                        domStats.fans = parseNum(fansMatch[1] || fansMatch[2]);
                        statsFound.fans = true;
                    }
                    if (notesMatch && !statsFound.notes) {
                        domStats.notes = parseNum(notesMatch[1] || notesMatch[2]);
                        statsFound.notes = true;
                    }
                    if (likesMatch && !statsFound.likes) {
                        domStats.likes = parseNum(likesMatch[1] || likesMatch[3]);
                        statsFound.likes = true;
                    }
                }
                if (statsFound.fans && statsFound.notes && statsFound.likes) break;
            }

            // 4. Fallback: search within profile header only (avoid note cards)
            if (!statsFound.fans || !statsFound.notes) {
                const header = document.querySelector('.user-info-panel, .profile-header, [class*="user-basic-info"], [class*="profile-info"]');
                if (header) {
                    const allText = textOf(header);
                    const fansMatch = allText.match(/([\\d.,]+[\\w万]?)\\s*粉丝/);
                    const notesMatch = allText.match(/([\\d.,]+[\\w万]?)\\s*笔记/);
                    const likesMatch = allText.match(/([\\d.,]+[\\w万]?)\\s*(获赞|赞与收藏)/);

                    if (fansMatch && !statsFound.fans) domStats.fans = parseNum(fansMatch[1]);
                    if (notesMatch && !statsFound.notes) domStats.notes = parseNum(notesMatch[1]);
                    if (likesMatch && !statsFound.likes) domStats.likes = parseNum(likesMatch[1]);
                }
            }

            // 5. Final fallback: conservative body-wide search for missing values
            //    Only use this if we couldn't find the value in header; and prefer larger numbers
            //    because small numbers are likely from note interactions.
            if (!statsFound.fans || !statsFound.notes || !statsFound.likes) {
                const candidates = { fans: [], notes: [], likes: [] };
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while ((node = walker.nextNode())) {
                    const parent = node.parentElement;
                    if (!parent) continue;
                    // Skip inside note cards / feeds
                    if (parent.closest('.note-item, .feed-item, [class*="note-card"], [class*="feed-card"]')) continue;

                    const text = textOf(parent);
                    if (!text) continue;

                    if (!statsFound.fans) {
                        const m = text.match(/([\\d.,]+[\\w万]?)\\s*粉丝/);
                        if (m) candidates.fans.push(parseNum(m[1]));
                    }
                    if (!statsFound.notes) {
                        const m = text.match(/([\\d.,]+[\\w万]?)\\s*笔记/);
                        if (m) candidates.notes.push(parseNum(m[1]));
                    }
                    if (!statsFound.likes) {
                        const m = text.match(/([\\d.,]+[\\w万]?)\\s*(获赞|赞与收藏)/);
                        if (m) candidates.likes.push(parseNum(m[1]));
                    }
                }

                if (!statsFound.fans && candidates.fans.length > 0) {
                    domStats.fans = Math.max(...candidates.fans);
                }
                if (!statsFound.notes && candidates.notes.length > 0) {
                    domStats.notes = Math.max(...candidates.notes);
                }
                if (!statsFound.likes && candidates.likes.length > 0) {
                    domStats.likes = Math.max(...candidates.likes);
                }
            }

            // 6. Merge results: __INITIAL_STATE__ takes precedence for numbers, DOM for text
            const nickname = initialNickname || textOf(nameEl);
            const avatar = initialAvatar || (avatarEl ? avatarEl.src : '');
            const desc = initialDesc || textOf(descEl);
            const fans_count = initialFans || domStats.fans;
            const notes_count = initialNotes || domStats.notes;
            const likes_count = initialLikes || domStats.likes;

            const statsParts = [];
            if (fans_count > 0) statsParts.push(fans_count + ' 粉丝');
            if (notes_count > 0) statsParts.push(notes_count + ' 笔记');
            if (likes_count > 0) statsParts.push(likes_count + ' 获赞');

            return {
                nickname: nickname,
                avatar: avatar,
                desc: desc,
                stats: statsParts.join(' | '),
                fans_count: fans_count,
                notes_count: notes_count,
                likes_count: likes_count,
                debug: {
                    initialFans: initialFans,
                    initialNotes: initialNotes,
                    initialLikes: initialLikes,
                    domFans: domStats.fans,
                    domNotes: domStats.notes,
                    domLikes: domStats.likes,
                    nameFound: !!nameEl,
                    avatarFound: !!avatarEl
                }
            };
        })()
    `;
}

/**
 * 功能描述：解析小红书用户资料 API 返回的粉丝/笔记/获赞数字
 *
 * 参数说明：
 * - userInfo: [any] API 返回的用户信息对象
 *
 * 返回说明：
 * - { fans_count, notes_count, likes_count } 数字对象
 */
export function parseProfileMetrics(userInfo: any): {
    fans_count: number;
    notes_count: number;
    likes_count: number;
} {
    if (!userInfo) return { fans_count: 0, notes_count: 0, likes_count: 0 };

    // Handle interactions array
    let fans_count = 0;
    let notes_count = 0;
    let likes_count = 0;

    const interactions = userInfo.interactions || userInfo.interaction || userInfo.stats;
    if (Array.isArray(interactions)) {
        for (const item of interactions) {
            const name = String(item.name || item.type || item.label || '');
            const value = item.count ?? item.num ?? item.value ?? '0';
            if (/粉丝/.test(name)) fans_count = DataSanitizer.parseCount(String(value));
            if (/笔记/.test(name)) notes_count = DataSanitizer.parseCount(String(value));
            if (/获赞|赞与收藏/.test(name)) likes_count = DataSanitizer.parseCount(String(value));
        }
    }

    // Fallback to direct fields
    if (!fans_count) {
        fans_count = DataSanitizer.parseCount(
            String(userInfo.fans ?? userInfo.fans_number ?? userInfo.fans_count ?? userInfo.follower_count ?? userInfo.follows ?? '')
        );
    }
    if (!notes_count) {
        notes_count = DataSanitizer.parseCount(
            String(userInfo.note_count ?? userInfo.notes_count ?? userInfo.notes_number ?? userInfo.total_notes ?? userInfo.post_count ?? '')
        );
    }
    if (!likes_count) {
        likes_count = DataSanitizer.parseCount(
            String(userInfo.collected_count ?? userInfo.collected ?? userInfo.likes_count ?? userInfo.likes ?? userInfo.total_liked ?? userInfo.total_likes ?? '')
        );
    }

    return { fans_count, notes_count, likes_count };
}
