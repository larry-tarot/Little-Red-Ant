
import { Logger } from '../LoggerService.js';
import { ContentService } from '../ai/ContentService.js';
import { scrapeNoteDetail } from './xiaohongshu.js';
import { DataSanitizer } from '../../utils/DataSanitizer.js';
import { CompetitorScraper } from '../scraper/CompetitorScraper.js';
import { CompetitorService } from '../core/CompetitorService.js';
import { RPAUtils } from './utils/RPAUtils.js';

/**
 * 功能描述：抓取竞品账号并保存分析结果
 *
 * 参数说明：
 * - input: [string | { url: string, id?: number }] 小红书主页 URL 或包含 URL 的对象
 *
 * 返回说明：
 * - { success, nickname, analysis, fans_count } 保存结果
 *
 * 设计思路：
 * 1. 先用 CompetitorScraper 抓取主页所有笔记
 * 2. 对 Top N 高赞笔记进行详情页深度抓取，补充 content/tags/comments/collects
 * 3. 将深度数据合并回完整笔记列表
 * 4. 调用 AI 分析并持久化
 */
export async function scrapeCompetitor(input: string | { url: string; id?: number }, signal?: AbortSignal) {
    const targetUrlOrId = typeof input === 'string' ? input : input.url;
    const dbId = typeof input === 'object' ? input.id : undefined;

    const userId = DataSanitizer.extractUserId(targetUrlOrId);
    if (!userId) {
        throw new Error('INVALID_URL: Could not extract user id from input');
    }

    if (signal?.aborted) {
        throw new Error('TASK_CANCELLED');
    }

    if (dbId) {
        CompetitorService.updateStatus(dbId, 'processing');
    }

    try {
        // 1. 抓取主页及笔记列表
        const scraper = new CompetitorScraper();
        const scrapeResult = await scraper.scrape(userId, signal);
        const { info, notes: normalizedNotes } = scrapeResult;

        Logger.info(
            'RPA:Competitor',
            `Scraped ${info.nickname} via ${scrapeResult.source}, found ${normalizedNotes.length} notes.`
        );

        // 2. 深度分析：对 Top N 高赞笔记抓取详情页
        // 取 Top 5，在分析质量与任务耗时/反爬风险间取得平衡
        const DEEP_ANALYSIS_LIMIT = 5;
        const sortedNotes = [...normalizedNotes]
            .sort((a, b) => b.likes - a.likes)
            .slice(0, DEEP_ANALYSIS_LIMIT);

        const detailMap = new Map<string, any>();

        Logger.info('RPA:Competitor', `Deep scraping top ${sortedNotes.length} notes for content analysis...`);

        for (const note of sortedNotes) {
            if (signal?.aborted) {
                Logger.info('RPA:Competitor', 'Cancel signal received, stopping deep analysis');
                break;
            }

            if (!note.url && !note.note_id) continue;

            try {
                const detail = await scrapeNoteDetail(note.note_id || note.url);
                detailMap.set(note.note_id || note.url, detail);
                Logger.info('RPA:Competitor', `Fetched detail for ${note.title || note.note_id}`);

                // 限流：每秒最多 20 次请求
                await RPAUtils.checkRateLimit('xiaohongshu', 20, 60);
                // 随机延迟，避免触发反爬（缩短到 500-1500ms，避免任务超时）
                await new Promise((r) => setTimeout(r, Math.random() * 1000 + 500));
            } catch (e: any) {
                Logger.warn('RPA:Competitor', `Failed to scrape detail for ${note.title || note.note_id}: ${e.message}`);
            }
        }

        // 3. 将详情数据合并回完整笔记列表
        const enrichedNotes = normalizedNotes.map((note) => {
            const key = note.note_id || note.url;
            const detail = key ? detailMap.get(key) : null;
            if (!detail) return note;

            return {
                ...note,
                title: detail.title || note.title,
                content: detail.content || '',
                tags: Array.isArray(detail.tags) ? detail.tags : [],
                likes: detail.likes_count ?? note.likes,
                comments: detail.comments_count ?? note.comments,
                collects: detail.collects_count ?? note.collects,
                views: detail.views_count ?? note.views,
                publish_date: detail.date ? new Date(detail.date).toISOString() : note.publish_date
            };
        });

        // 4. AI 分析
        let analysis = '{}';
        if (enrichedNotes.length > 0) {
            try {
                Logger.info('RPA:Competitor', 'Starting AI analysis with deep data...');
                analysis = await ContentService.analyzeCompetitor({
                    nickname: info.nickname,
                    desc: info.desc,
                    notes: enrichedNotes
                });
            } catch (e: any) {
                Logger.error('RPA:Competitor', 'AI Analysis failed', e);
                analysis = JSON.stringify({ error: 'AI Analysis failed: ' + e.message });
            }
        }

        // 5. 持久化
        const saveResult = CompetitorService.saveScrapeResult(
            dbId ?? 0,
            userId,
            info,
            enrichedNotes,
            analysis
        );

        return saveResult;
    } catch (error: any) {
        Logger.error('RPA:Competitor', `Task failed: ${error.message}`, error);

        if (dbId) {
            CompetitorService.updateStatus(dbId, 'error', error.message);
        }

        throw error;
    }
}
