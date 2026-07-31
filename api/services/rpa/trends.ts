
import { BrowserService } from './BrowserService.js';
import { Logger } from '../LoggerService.js';
import db from '../../db.js';

    // Define channel mapping
    const CHANNEL_MAP: Record<string, string> = {
        'recommend': 'homefeed_recommend',
        'video': 'homefeed.video_v3',
        'fashion': 'homefeed.fashion_v3',
        'beauty': 'homefeed.cosmetics_v3',
        'food': 'homefeed.food_v3',
        'home': 'homefeed.home_v3',
        'travel': 'homefeed.travel_v3',
        'tech': 'homefeed.tech_digital_v3',
        'emotion': 'homefeed.love_v3',
        'baby': 'homefeed.baby_v3',
        'movie': 'homefeed.movie_and_tv_v3',
        'knowledge': 'homefeed.education_v3',
        'game': 'homefeed.game_v3',
        'fitness': 'homefeed.fitness_v3',
        'career': 'homefeed.career_v3',
        'pets': 'homefeed.pets_v3',
        'photography': 'homefeed.photography_v3',
        'art': 'homefeed.art_v3',
        'music': 'homefeed.music_v3',
        'books': 'homefeed.books_v3',
        'automobile': 'homefeed.automotive_v3',
        'wedding': 'homefeed.wedding_v3',
        'outdoors': 'homefeed.outdoors_v3',
        'acg': 'homefeed.anime_v3',
        'sports': 'homefeed.sports_v3',
        'news': 'homefeed.news_v3'
};

export async function scrapeTrending(category: string = 'recommend') {
    // 0. 前置检查：必须有已激活且至少有一种有效 cookie 的账号
    const activeAccount = db.prepare(
        'SELECT id, creator_cookies, main_site_cookies, cookies FROM accounts WHERE is_active = 1 LIMIT 1'
    ).get() as { id: number; creator_cookies?: string; main_site_cookies?: string; cookies?: string } | undefined;

    if (!activeAccount) {
        Logger.warn('RPA:Trends', 'No active account found, cannot scrape trends');
        throw new Error('NO_ACTIVE_ACCOUNT: Please bind a Xiaohongshu account in Account Matrix first');
    }

    const hasAnyCookie = !!(activeAccount.creator_cookies || activeAccount.main_site_cookies || activeAccount.cookies);
    if (!hasAnyCookie) {
        Logger.warn('RPA:Trends', `Active account ${activeAccount.id} has no cookies`);
        throw new Error('COOKIE_EXPIRED: Account cookies missing, please re-authorize in Account Matrix');
    }

    let session;
    try {
        session = await BrowserService.getInstance().getAuthenticatedPage('MAIN_SITE', true); // Force Headless
    } catch (_e) {
        Logger.warn('RPA:Trends', 'Failed to get MAIN_SITE session, trying CREATOR fallback...');
        try {
            session = await BrowserService.getInstance().getAuthenticatedPage('CREATOR', true);
        } catch (_fallbackError: any) {
            Logger.error('RPA:Trends', `Failed to create browser session: ${_fallbackError.message}`);
            throw new Error('COOKIE_EXPIRED: Unable to create browser session, please re-authorize in Account Matrix');
        }
    }

    if (!session) {
        throw new Error('Failed to create browser session.');
    }

    const { page } = session;
    const collectedNotes = new Map(); // Use Map to deduplicate by ID

    // Verify category in request URL to prevent data pollution
    const _expectedChannelId = CHANNEL_MAP[category] || 'homefeed_recommend';

    // Setup listener for Feed API
    const responseHandler = async (response: any) => {
        try {
            const url = response.url();
            const request = response.request();
            const _requestUrl = request.url(); 
            const _postData = request.postData(); // Get POST body if any
            
            // Match feed APIs
            // Note: Sometimes XHS uses /api/sns/web/v1/homefeed, sometimes just /feed
            if (url.includes('/api/sns/web/v1/homefeed') || url.includes('/api/sns/web/v1/feed')) {
                // LOOSE FILTERING: Accept all feeds to maximize data collection
                // The client-side filter is better than missing data here.
                
                // Logger.info('RPA:Trends', `Intercepted feed response: ${url}`);
                const json = await response.json();
                
                if (json.data && Array.isArray(json.data.items)) {
                    json.data.items.forEach((item: any) => {
                        // 接受普通笔记与视频笔记；过滤掉广告/占位等非内容项
                        const isValidContentType =
                            item.model_type === 'note' ||
                            item.model_type === 'video' ||
                            item.model_type === 'video_note' ||
                            !item.model_type;
                        if (item.id && isValidContentType) {
                            // Construct valid URL with xsec_token
                            // Fallback token if missing (though usually present in API)
                            // Try to find token in item or item.note_card
                            const token = item.xsec_token || item.note_card?.xsec_token || '';
                            const noteUrl = `https://www.xiaohongshu.com/explore/${item.id}?xsec_token=${token}&xsec_source=pc_feed`;
                            
                            // Extract cover
                            // Usually images_list[0].url_default or url
                            let cover = '';
                            if (item.cover) {
                                cover = item.cover.url_default || item.cover.url;
                            } else if (item.note_card && item.note_card.cover) {
                                cover = item.note_card.cover.url_default || item.note_card.cover.url;
                            } else if (item.images_list && item.images_list.length > 0) {
                                cover = item.images_list[0].url_default || item.images_list[0].url;
                            } else if (item.note_card && item.note_card.images_list && item.note_card.images_list.length > 0) {
                                cover = item.note_card.images_list[0].url_default || item.note_card.images_list[0].url;
                            }

                            if (cover && cover.startsWith('http://')) cover = cover.replace('http://', 'https://');

                            // Parse heat (likes count)
                            const rawHeat = item.interact_info?.liked_count || item.note_card?.interact_info?.liked_count || '0';
                            let heat = 0;
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

                            // Parse comments count (Feed usually doesn't have it, so return -1 to indicate unknown)
                            // If it exists (unlikely in feed), parse it. If not, -1.
                            const rawComments = item.interact_info?.comment_count || item.note_card?.interact_info?.comment_count;
                            let comments = -1; 
                            if (rawComments !== undefined && rawComments !== null) {
                                if (typeof rawComments === 'number') {
                                    comments = rawComments;
                                } else if (typeof rawComments === 'string') {
                                    if (rawComments.includes('万')) {
                                        comments = parseFloat(rawComments.replace('万', '')) * 10000;
                                    } else if (rawComments.includes('w')) {
                                        comments = parseFloat(rawComments.replace('w', '')) * 10000;
                                    } else {
                                        comments = parseInt(rawComments, 10) || 0;
                                    }
                                }
                            }

                            // Parse collects count (Feed usually doesn't have it, so return -1)
                            const rawCollects = item.interact_info?.collected_count || item.note_card?.interact_info?.collected_count;
                            let collects = -1;
                            if (rawCollects !== undefined && rawCollects !== null) {
                                if (typeof rawCollects === 'number') {
                                    collects = rawCollects;
                                } else if (typeof rawCollects === 'string') {
                                    if (rawCollects.includes('万')) {
                                        collects = parseFloat(rawCollects.replace('万', '')) * 10000;
                                    } else if (rawCollects.includes('w')) {
                                        collects = parseFloat(rawCollects.replace('w', '')) * 10000;
                                    } else {
                                        collects = parseInt(rawCollects, 10) || 0;
                                    }
                                }
                            }

                            // Detect Video
                            const isVideo = item.model_type === 'video' || item.type === 'video' || (item.note_card && item.note_card.type === 'video');

                            collectedNotes.set(item.id, {
                                title: item.display_title || item.title || item.note_card?.display_title || item.note_card?.title || '',
                                heat: heat,
                                comments: comments,
                                collects: collects,
                                url: noteUrl,
                                cover: cover,
                                // images: images, // Pass full image list -> 'images' not defined, skipping or fixing
                                author: item.user?.nickname || item.note_card?.user?.nickname || '',
                                summary: item.desc || item.note_card?.desc || '',
                                is_video: isVideo
                            });
                        }
                    });
                }
            }
        } catch (_e) {
            // Ignore JSON parse errors or other issues
        }
    };

    page.on('response', responseHandler);

    try {
        const channelId = CHANNEL_MAP[category] || 'homefeed_recommend';
        const targetUrl = `https://www.xiaohongshu.com/explore?channel_id=${channelId}`;
        
        Logger.info('RPA:Trends', `Navigating to ${targetUrl} (Category: ${category})...`);
        
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        // Scroll to trigger API calls
        Logger.info('RPA:Trends', 'Scrolling to load content...');
        for (let i = 0; i < 6; i++) { // Increase scroll count
            await page.evaluate(() => { window.scrollBy(0, 1000); });
            await page.waitForTimeout(1500);
        }
        
        // Remove listener
        page.off('response', responseHandler);
        
        const results = Array.from(collectedNotes.values());
        Logger.info('RPA:Trends', `Scraped ${results.length} trending notes for ${category}.`);
        
        return results;

    } catch (error: any) {
        Logger.error('RPA:Trends', `Scrape failed: ${error.message}`, error);
        throw error;
    } finally {
        if (page) {
            page.off('response', responseHandler);
            try { await page.close(); } catch(_e) { /* ignore */ }
        }
    }
}
