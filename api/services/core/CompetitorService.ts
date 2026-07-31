
import db from '../../db.js';
import { DataSanitizer } from '../../utils/DataSanitizer.js';
import { wrapError } from '../../utils/ErrorMessages.js';
import { Logger } from '../LoggerService.js';

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
        // Parse stats: 优先使用抓取策略直接返回的数字字段
        let fans_count = Number(info.fans_count) || 0;
        let notes_count = Number(info.notes_count) || 0;
        let likes_count = Number(info.likes_count) || 0;

        // 兜底：从 stats 字符串中解析
        const parts = (info.stats || '').split('|').map((s: string) => s.trim());
        for (const part of parts) {
            if (fans_count === 0 && part.includes('粉丝')) {
                fans_count = DataSanitizer.parseCount(part);
            }
            if (notes_count === 0 && part.includes('笔记')) {
                notes_count = DataSanitizer.parseCount(part);
            }
            if (likes_count === 0 && (part.includes('获赞') || part.includes('赞与收藏'))) {
                likes_count = DataSanitizer.parseCount(part);
            }
        }

        // 数据可信度校验：昵称是判断是否抓到正确页面的关键字段
        if (!info.nickname) {
            Logger.warn('CompetitorService', `Refusing to save scrape result for ${userId}: missing nickname`);
            throw new Error('INVALID_SCRAPE_DATA: Missing nickname, page may not be a valid profile');
        }

        // 合理性校验：如果 notes_count 非 0 但小于实际抓取到的笔记数，说明可能抓错了
        // （例如把某个笔记互动数当成了总笔记数）。此时保留 0，让前端显示 "-"，避免误导。
        if (notes_count > 0 && notes_count < normalizedNotes.length) {
            Logger.warn(
                'CompetitorService',
                `notes_count (${notes_count}) is less than scraped notes (${normalizedNotes.length}) for ${info.nickname || userId}, resetting to 0`
            );
            notes_count = 0;
        }

        // 额外防护：没有任何有效数据时不保存（避免把错误页/登录页的数字写进数据库）
        const hasAnyData =
            fans_count > 0 ||
            notes_count > 0 ||
            likes_count > 0 ||
            (Array.isArray(normalizedNotes) && normalizedNotes.length > 0);
        if (!hasAnyData) {
            Logger.warn('CompetitorService', `Refusing to save scrape result for ${info.nickname || userId}: all metrics are zero and no notes found`);
            throw new Error('INVALID_SCRAPE_DATA: No valid metrics or notes extracted');
        }

        // 当 API / DOM 都没有返回总笔记数时，用实际抓取到的笔记数作为"当前可见笔记数"兜底，
        // 避免前端完全无法展示笔记数量。这个数字可能小于博主真实总笔记数，但比显示 "-" 更有价值。
        if (notes_count === 0 && normalizedNotes.length > 0) {
            notes_count = normalizedNotes.length;
            Logger.info('CompetitorService', `notes_count unavailable for ${info.nickname || userId}, using scraped count ${notes_count} as fallback`);
        }

        const totalLikes = normalizedNotes.reduce((acc: number, cur: any) => acc + (cur.likes || 0), 0);
        const totalComments = normalizedNotes.reduce((acc: number, cur: any) => acc + (cur.comments || 0), 0);
        const totalCollects = normalizedNotes.reduce((acc: number, cur: any) => acc + (cur.collects || 0), 0);

        Logger.info(
            'CompetitorService',
            `Saving ${info.nickname || userId}: fans=${fans_count}, notes=${notes_count}, likes=${likes_count}, scrapedNotes=${normalizedNotes.length}`
        );

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
                    SET nickname = ?, avatar = ?, desc = ?, latest_notes = ?, analysis_result = ?,
                        fans_count = ?, notes_count = ?, likes_count = ?, status = 'active', last_error = NULL,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    info.nickname,
                    DataSanitizer.normalizeUrl(info.avatar),
                    info.desc || '',
                    JSON.stringify(normalizedNotes),
                    analysis,
                    fans_count,
                    notes_count,
                    likes_count,
                    finalDbId
                );
            } else {
                const res = db.prepare(`
                    INSERT INTO competitors (user_id, nickname, avatar, desc, latest_notes, analysis_result, fans_count, notes_count, likes_count, status, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
                `).run(
                    userId,
                    info.nickname,
                    DataSanitizer.normalizeUrl(info.avatar),
                    info.desc || '',
                    JSON.stringify(normalizedNotes),
                    analysis,
                    fans_count,
                    notes_count,
                    likes_count
                );
                finalDbId = res.lastInsertRowid as number;
            }

            // 2. Insert Stats History
            db.prepare(`
                INSERT INTO competitor_stats_history (competitor_id, fans_count, notes_count, likes_count)
                VALUES (?, ?, ?, ?)
            `).run(finalDbId, fans_count, notes_count, likes_count);

            // 3. Sync Notes
            const getNoteId = (url: string) => {
                const match = url.match(/\/explore\/([a-zA-Z0-9]+)/);
                return match ? match[1] : null;
            };

            for (const note of normalizedNotes) {
                const noteId = note.note_id || getNoteId(note.url);
                if (!noteId) continue;

                const existingNote = db.prepare('SELECT id FROM competitor_notes WHERE competitor_id = ? AND note_id = ?').get(finalDbId, noteId) as any;
                const tagsJson = Array.isArray(note.tags) ? JSON.stringify(note.tags) : null;

                if (existingNote) {
                    db.prepare(`
                        UPDATE competitor_notes
                        SET title = ?, cover = ?, url = ?, likes = ?, comments = ?, collects = ?, views = ?,
                            content = ?, tags = ?, publish_date = ?, scraped_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(
                        note.title,
                        note.cover,
                        note.url,
                        note.likes || 0,
                        note.comments || 0,
                        note.collects || 0,
                        note.views || 0,
                        note.content || null,
                        tagsJson,
                        note.publish_date || null,
                        existingNote.id
                    );

                    db.prepare(`
                        INSERT INTO note_stats_history (note_id, competitor_id, likes, collects, comments)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(noteId, finalDbId, note.likes || 0, note.collects || 0, note.comments || 0);
                } else {
                    db.prepare(`
                        INSERT INTO competitor_notes (competitor_id, note_id, title, cover, url, likes, comments, collects, views, content, tags, publish_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        finalDbId,
                        noteId,
                        note.title,
                        note.cover,
                        note.url,
                        note.likes || 0,
                        note.comments || 0,
                        note.collects || 0,
                        note.views || 0,
                        note.content || null,
                        tagsJson,
                        note.publish_date || null
                    );

                    db.prepare(`
                        INSERT INTO note_stats_history (note_id, competitor_id, likes, collects, comments)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(noteId, finalDbId, note.likes || 0, note.collects || 0, note.comments || 0);
                }
            }
        })();

        return {
            success: true,
            nickname: info.nickname,
            analysis,
            fans_count,
            notes_count,
            total_likes: totalLikes,
            total_comments: totalComments,
            total_collects: totalCollects
        };
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
            SELECT id, user_id, nickname, avatar, fans_count, notes_count, likes_count,
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

            // 数据保护：如果最近一次抓取失败且错误明显是登录/浏览器问题，
            // 说明当前粉丝/笔记数字可能是错误页提取的垃圾数据，前端展示时隐藏为 "-"
            const isAuthOrBrowserError =
                item.status === 'error' &&
                item.last_error &&
                /COOKIE_EXPIRED|LOGIN_REQUIRED|NO_ACTIVE_ACCOUNT|browser has been closed|BROWSER_ERROR/i.test(item.last_error);

            return {
                ...item,
                fans_count: isAuthOrBrowserError ? 0 : item.fans_count,
                notes_count: isAuthOrBrowserError ? 0 : item.notes_count,
                likes_count: isAuthOrBrowserError ? 0 : item.likes_count,
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
