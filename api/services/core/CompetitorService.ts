
import db from '../../db.js';
import { DataSanitizer } from '../../utils/DataSanitizer.js';
import { wrapError } from '../../utils/ErrorMessages.js';

export class CompetitorService {
    static getById(id: number) {
        return db.prepare('SELECT * FROM competitors WHERE id = ?').get(id);
    }

    static getByUserId(userId: string) {
        return db.prepare('SELECT * FROM competitors WHERE user_id = ?').get(userId);
    }

    static updateStatus(id: number, status: string, error?: string) {
        db.prepare("UPDATE competitors SET status = ?, last_error = ? WHERE id = ?").run(status, error || null, id);
    }

    static saveScrapeResult(dbId: number, userId: string, info: any, normalizedNotes: any[], analysis: string) {
        // Parse stats
        let fans_count = 0;
        const parts = info.stats.split('|').map((s: string) => s.trim());
        for (const part of parts) {
             if (part.includes('粉丝')) {
                 fans_count = DataSanitizer.parseCount(part);
             }
        }
        
        const totalLikes = normalizedNotes.reduce((acc: number, cur: any) => acc + cur.likes, 0);

        let finalDbId = dbId;
        if (!finalDbId) {
             const existing = this.getByUserId(userId) as any;
             finalDbId = existing?.id;
        }

        db.transaction(() => {
            // 1. Upsert Competitor
            if (finalDbId) {
                db.prepare(`
                    UPDATE competitors 
                    SET nickname = ?, avatar = ?, latest_notes = ?, analysis_result = ?, 
                        fans_count = ?, notes_count = ?, status = 'active', last_error = NULL, 
                        last_updated = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `).run(
                    info.nickname, 
                    DataSanitizer.normalizeUrl(info.avatar), 
                    JSON.stringify(normalizedNotes), 
                    analysis, 
                    fans_count, 
                    normalizedNotes.length,
                    finalDbId
                );
            } else {
                const res = db.prepare(`
                    INSERT INTO competitors (user_id, nickname, avatar, latest_notes, analysis_result, fans_count, notes_count, status, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
                `).run(
                    userId, info.nickname, DataSanitizer.normalizeUrl(info.avatar), 
                    JSON.stringify(normalizedNotes), analysis, fans_count, normalizedNotes.length
                );
                finalDbId = res.lastInsertRowid as number;
            }

            // 2. Insert Stats History
            db.prepare(`
                INSERT INTO competitor_stats_history (competitor_id, fans_count, notes_count, likes_count)
                VALUES (?, ?, ?, ?)
            `).run(finalDbId, fans_count, normalizedNotes.length, totalLikes);

            // 3. Sync Notes
            const getNoteId = (url: string) => {
                const match = url.match(/\/explore\/([a-zA-Z0-9]+)/);
                return match ? match[1] : null;
            };

            for (const note of normalizedNotes) {
                const noteId = note.note_id || getNoteId(note.url); // Use provided note_id if available
                if (!noteId) continue;

                const existingNote = db.prepare('SELECT id FROM competitor_notes WHERE competitor_id = ? AND note_id = ?').get(finalDbId, noteId) as any;

                if (existingNote) {
                    db.prepare(`
                        UPDATE competitor_notes 
                        SET title = ?, cover = ?, likes = ?, scraped_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(note.title, note.cover, note.likes, existingNote.id);
                    
                    db.prepare(`
                        INSERT INTO note_stats_history (note_id, competitor_id, likes, collects, comments)
                        VALUES (?, ?, ?, 0, 0)
                    `).run(noteId, finalDbId, note.likes);

                } else {
                    db.prepare(`
                        INSERT INTO competitor_notes (competitor_id, note_id, title, cover, url, likes, publish_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(finalDbId, noteId, note.title, note.cover, note.url, note.likes, note.publish_date || null);

                    db.prepare(`
                        INSERT INTO note_stats_history (note_id, competitor_id, likes, collects, comments)
                        VALUES (?, ?, ?, 0, 0)
                    `).run(noteId, finalDbId, note.likes);
                }
            }

        })();

        return { success: true, nickname: info.nickname, analysis, fans_count };
    }

    // ==================== 路由查询方法 ====================

    /**
     * 功能描述：获取竞品列表（按状态优先级和更新时间排序）
     *
     * 返回说明：
     * - any[] 竞品列表，latest_notes 和 analysis_result 已解析为对象/数组
     *
     * 使用示例：
     * >>> const list = CompetitorService.listCompetitors();
     * >>> console.log(list.length);
     *
     * NOTE: 排序规则：pending/processing/refreshing 状态优先显示，其次按更新时间倒序
     */
    static listCompetitors(): any[] {
        const list = db.prepare(`
            SELECT id, user_id, nickname, avatar, fans_count, notes_count,
                   status, last_error, last_updated, analysis_result, latest_notes
            FROM competitors
            ORDER BY
                CASE WHEN status IN ('pending', 'processing', 'refreshing') THEN 0 ELSE 1 END,
                last_updated DESC
        `).all() as any[];

        return list.map((item: any) => {
            // 解析 analysis_result（兼容历史脏数据：可能是原始字符串）
            let analysis = DataSanitizer.safeJsonParse(item.analysis_result, {});
            if (typeof analysis === 'string' && analysis.startsWith('{')) {
                analysis = DataSanitizer.safeJsonParse(analysis, {});
            }

            // 失败竞品添加友好错误信息
            let friendlyError = null;
            if (item.status === 'error' && item.last_error) {
                friendlyError = wrapError(item.last_error);
            }

            return {
                ...item,
                latest_notes: DataSanitizer.safeJsonParse(item.latest_notes, []),
                analysis_result: analysis,
                friendlyError
            };
        });
    }

    /**
     * 功能描述：获取竞品详情（含笔记列表和历史统计）
     *
     * 参数说明：
     * - id: [number | string] 竞品数据库 ID
     *
     * 返回说明：
     * - any | undefined 竞品详情对象，analysis_result 已解析
     */
    static getCompetitorDetail(id: number | string): any | undefined {
        const competitor = db.prepare('SELECT * FROM competitors WHERE id = ?').get(id) as any;
        if (!competitor) return undefined;

        // 关联查询笔记列表（按点赞数倒序）
        const notes = db.prepare('SELECT * FROM competitor_notes WHERE competitor_id = ? ORDER BY likes DESC, id ASC').all(id);
        // 关联查询历史统计（按日期正序，便于绘图）
        const statsHistory = db.prepare('SELECT * FROM competitor_stats_history WHERE competitor_id = ? ORDER BY record_date ASC').all(id);

        // 解析 analysis_result（兼容历史脏数据）
        let analysis = DataSanitizer.safeJsonParse(competitor.analysis_result, {});
        if (typeof analysis === 'string' && analysis.startsWith('{')) {
            analysis = DataSanitizer.safeJsonParse(analysis, {});
        }

        return {
            ...competitor,
            analysis_result: analysis,
            notes,
            stats_history: statsHistory
        };
    }

    /**
     * 功能描述：添加或刷新竞品（已存在则标记为 refreshing，不存在则新建 pending 记录）
     *
     * 参数说明：
     * - userId: [string] 小红书用户 ID（从 URL 提取）
     *
     * 返回说明：
     * - { dbId: number | bigint, isExisting: boolean } 数据库 ID 和是否为已存在的竞品
     */
    static addOrRefreshCompetitor(userId: string): { dbId: number | bigint; isExisting: boolean } {
        const existing = this.getByUserId(userId) as any;

        if (existing) {
            // 已存在：标记为 refreshing 状态，清除上次错误
            db.prepare("UPDATE competitors SET status = 'refreshing', last_error = NULL WHERE id = ?").run(existing.id);
            return { dbId: existing.id, isExisting: true };
        }

        // 不存在：新建 pending 记录（nickname 由爬虫后续更新）
        const result = db.prepare(`
            INSERT INTO competitors (user_id, nickname, status, created_at, last_updated)
            VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(userId, 'New Competitor');

        return { dbId: result.lastInsertRowid, isExisting: false };
    }

    /**
     * 功能描述：删除竞品（关联数据由数据库 CASCADE 级联删除）
     *
     * 参数说明：
     * - id: [number | string] 竞品数据库 ID
     */
    static deleteCompetitor(id: number | string): void {
        db.prepare('DELETE FROM competitors WHERE id = ?').run(id);
    }
}
