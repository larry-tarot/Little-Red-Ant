import { enqueueTask } from '../../queue.js';
import { scrapeSearchNotes } from '../../rpa/search.js';
import { TaskHandler, TaskProgressEvent } from '../TaskHandler.js';
import { TrendService } from '../../core/TrendService.js';
import { Logger } from '../../LoggerService.js';

/**
 * Handler for scraping Xiaohongshu search results by keyword
 *
 * Payload:
 *   - keyword: string (required) - Search keyword
 *   - sort: string (optional) - "general" | "latest" | "popular", default "general"
 *   - limit: number (optional) - Max notes to collect, default 20
 *   - autoAnalyze: boolean (optional) - Auto-trigger analysis for top notes, default true
 */
export class ScrapeSearchNotesHandler implements TaskHandler {
    async handle(task: any, onProgress?: (e: TaskProgressEvent) => void): Promise<any> {
        const keyword = task.payload.keyword;
        const sort = task.payload.sort || 'general';
        const limit = task.payload.limit || 20;
        const autoAnalyze = task.payload.autoAnalyze !== false;
        const report = (p: number, s: string) => onProgress?.({ taskId: task.id, progress: p, stage: s });

        if (!keyword || typeof keyword !== 'string') {
            throw new Error('Missing or invalid keyword in payload');
        }

        Logger.info('Worker', `Scraping search notes for keyword: "${keyword}" (sort: ${sort}, limit: ${limit})`);
        report(10, '执行搜索抓取');

        const rawNotes = await scrapeSearchNotes(keyword, sort, limit);

        if (!rawNotes || rawNotes.length === 0) {
            Logger.warn('Worker', `No search results found for keyword: "${keyword}"`);
            report(100, '完成');
            return { keyword, count: 0, status: 'EMPTY' };
        }

        report(50, '保存搜索结果');
        // Persist to database with search_keyword
        await TrendService.saveTrends(
            rawNotes.map((n: any) => ({
                title: n.title,
                heat: n.likes_count,
                comments: n.comments_count,
                collects: n.collects_count,
                url: n.note_url,
                cover: n.cover_url,
                author: n.author_name,
                summary: n.content || '',
                is_video: n.type === 'video',
                images: n.images
            })),
            'search',
            'xiaohongshu',
            keyword
        );

        Logger.info('Worker', `Saved ${rawNotes.length} search results for keyword: "${keyword}"`);

        // Auto-trigger analysis for top-performing notes
        if (autoAnalyze && rawNotes.length > 0) {
            const sortedByLikes = [...rawNotes].sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0));
            const topNotes = sortedByLikes.slice(0, 3);
            report(65, 'AI 分析高产笔记');

            Logger.info('Worker', `Auto-analyzing top ${topNotes.length} notes for keyword: "${keyword}"`);

            for (const note of topNotes) {
                const noteIdMatch = note.note_url.match(/\/(explore|discovery\/item)\/([a-zA-Z0-9]+)/);
                const noteId = noteIdMatch && noteIdMatch[2] ? noteIdMatch[2] : note.note_id;

                if (noteId) {
                    enqueueTask('ANALYZE_NOTE', { noteId });
                    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
                }
            }
        }

        report(100, '完成');

        return {
            keyword,
            count: rawNotes.length,
            status: 'SUCCESS',
            sort,
            limit
        };
    }
}
