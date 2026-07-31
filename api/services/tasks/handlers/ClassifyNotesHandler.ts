import db from '../../../db.js';
import { ContentService } from '../../ai/ContentService.js';
import { TaskHandler, TaskProgressEvent } from '../TaskHandler.js';
import { Logger } from '../../LoggerService.js';

/**
 * Handler for AI-based topic classification of notes
 *
 * Payload:
 *   - keyword: string (optional) - Classify notes for specific keyword
 *   - noteIds: string[] (optional) - Specific note IDs to classify
 *   - categories: string[] (optional) - Custom category list
 *   - batchSize: number (optional) - AI batch size, default 10
 */
export class ClassifyNotesHandler implements TaskHandler {
    async handle(task: any, onProgress?: (e: TaskProgressEvent) => void, signal?: AbortSignal): Promise<any> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }
        const keyword = task.payload.keyword;
        const noteIds = task.payload.noteIds;
        const categories = task.payload.categories;
        const batchSize = task.payload.batchSize || 10;
        const report = (p: number, s: string) => onProgress?.({ taskId: task.id, progress: p, stage: s });

        // Build query to fetch unclassified or target notes
        let whereClause = 'topic_tags IS NULL';
        const params: any[] = [];

        if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
            const placeholders = noteIds.map(() => '?').join(',');
            whereClause = `note_id IN (${placeholders})`;
            params.push(...noteIds);
        } else if (keyword) {
            whereClause = 'search_keyword = ?';
            params.push(keyword);
        }

        // Fetch notes to classify
        const notes = db.prepare(`
            SELECT note_id, title, content
            FROM trending_notes
            WHERE ${whereClause}
            ORDER BY likes_count DESC
            LIMIT 100
        `).all(...params) as Array<{ note_id: string; title: string; content: string }>;

        if (!notes || notes.length === 0) {
            Logger.info('Worker', 'No notes to classify');
            return { classified: 0, status: 'EMPTY' };
        }

        Logger.info('Worker', `Classifying ${notes.length} notes into topics...`);

        // Process in batches to avoid token limits
        let totalClassified = 0;
        const updateStmt = db.prepare(`
            UPDATE trending_notes
            SET topic_tags = ?
            WHERE note_id = ?
        `);

        for (let i = 0; i < notes.length; i += batchSize) {
            const batch = notes.slice(i, i + batchSize);
            const pct = Math.round((i / notes.length) * 70) + 10; // 10% → 80%
            report(pct, `AI 分类批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(notes.length / batchSize)}`);

            try {
                const classification = await ContentService.classifyNoteTopics(
                    batch.map(n => ({
                        note_id: n.note_id,
                        title: n.title,
                        content: n.content || ''
                    })),
                    categories
                );

                // Save results
                for (const [noteId, tags] of Object.entries(classification)) {
                    if (tags && tags.length > 0) {
                        updateStmt.run(JSON.stringify(tags), noteId);
                        totalClassified++;
                    }
                }

                Logger.info('Worker', `Batch ${Math.floor(i / batchSize) + 1} classified: ${batch.length} notes`);

                // Delay between batches to avoid rate limiting
                if (i + batchSize < notes.length) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e: any) {
                Logger.error('Worker', `Classification batch failed: ${e.message}`);
                // Continue with next batch
            }
        }

        Logger.info('Worker', `Topic classification complete. ${totalClassified} notes classified.`);
        report(100, '完成');

        return {
            classified: totalClassified,
            total: notes.length,
            keyword: keyword || null,
            status: 'SUCCESS'
        };
    }
}
