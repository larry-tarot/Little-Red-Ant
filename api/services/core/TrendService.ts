import db from '../../db.js';
import { SettingsService } from '../SettingsService.js';
import { Logger } from '../LoggerService.js';

export class TrendService {
    // Static initializer for schema migration (Lazy)
    static {
        try {
            db.prepare('ALTER TABLE trending_notes ADD COLUMN images TEXT').run();
            Logger.info('TrendService', 'Schema migration: Added images column');
        } catch (e: any) {
            // Ignore duplicate column error
            if (!e.message.includes('duplicate column')) {
                // Logger.warn('TrendService', 'Schema migration check failed', e);
            }
        }
    }

    /**
     * Save or Update trending notes from scraping results
     */
    static async saveTrends(notes: any[], category: string, platform: string = 'xiaohongshu', searchKeyword?: string) {
        if (!notes || notes.length === 0) return;

        const insertNote = db.prepare(`
            INSERT INTO trending_notes (
                platform, note_id, title, content, author_name, cover_url,
                note_url, likes_count, comments_count, collects_count, scraped_at, category, type, images, search_keyword
            ) VALUES (
                @platform, @note_id, @title, @content, @author, @cover,
                @url, @heat, @comments, @collects, CURRENT_TIMESTAMP, @category, @type, @images, @search_keyword
            )
            ON CONFLICT(note_id) DO UPDATE SET
            likes_count = @heat,
            comments_count = @comments,
            collects_count = @collects,
            cover_url = excluded.cover_url,
            note_url = excluded.note_url,
            title = excluded.title,
            content = COALESCE(excluded.content, content),
            author_name = excluded.author_name,
            scraped_at = CURRENT_TIMESTAMP,
            category = excluded.category,
            type = excluded.type,
            images = COALESCE(excluded.images, images),
            search_keyword = COALESCE(excluded.search_keyword, search_keyword)
        `);

        // Transaction for batch insert
        const transaction = db.transaction((notesToInsert) => {
            for (const note of notesToInsert) {
                let noteId = note.url;
                const noteIdMatch = note.url.match(/\/(explore|discovery\/item)\/([a-zA-Z0-9]+)/);
                if (noteIdMatch && noteIdMatch[2]) {
                    noteId = noteIdMatch[2];
                }

                try {
                    insertNote.run({
                        platform,
                        note_id: noteId,
                        title: note.title,
                        content: note.summary || '',
                        author: note.author,
                        cover: note.cover,
                        url: note.url,
                        heat: note.heat,
                        comments: note.comments || 0,
                        collects: note.collects || 0,
                        category: category,
                        type: note.is_video ? 'video' : 'image',
                        images: note.images ? JSON.stringify(note.images) : null,
                        search_keyword: searchKeyword || null
                    });
                } catch (e) {
                    Logger.error('TrendService', `Failed to insert note: ${note.title}`, e);
                }
            }
        });

        transaction(notes);
        Logger.info('TrendService', `Saved ${notes.length} trends for category: ${category}`);
    }

    /**
     * Get a note by ID
     */
    static getNoteById(noteId: string) {
        return db.prepare('SELECT * FROM trending_notes WHERE note_id = ?').get(noteId) as any;
    }

    /**
     * Update detailed note information after deep scraping
     */
    static updateNoteDetails(noteId: string, details: any, videoFrames: string[] = []) {
        db.prepare(`
            UPDATE trending_notes 
            SET content = ?, tags = ?, created_at = ?,
                likes_count = COALESCE(?, likes_count),
                comments_count = COALESCE(?, comments_count),
                collects_count = COALESCE(?, collects_count),
                type = ?,
                transcript = ?,
                video_meta = ?,
                images = ?
            WHERE note_id = ?
        `).run(
            details.content, 
            JSON.stringify(details.tags), 
            details.date || new Date().toISOString(),
            details.likes_count,
            details.comments_count,
            details.collects_count,
            details.is_video ? 'video' : 'image',
            details.transcript || null,
            details.video_meta ? JSON.stringify(details.video_meta) : null,
            details.images ? JSON.stringify(details.images) : null,
            noteId
        );
        
        Logger.info('TrendService', `Updated details for note: ${noteId}`);
        return { ...details, videoFrames };
    }

    /**
     * Save AI Analysis result
     */
    static saveAnalysisResult(noteId: string, analysis: any) {
        db.prepare(`
            UPDATE trending_notes 
            SET analysis_result = ?
            WHERE note_id = ?
        `).run(JSON.stringify(analysis), noteId);
        Logger.info('TrendService', `Saved analysis for note: ${noteId}`);
    }

    /**
     * Check for viral notes and return candidates for auto-analysis
     */
    static async getViralNotesCandidates(notes: any[]) {
        // Load config
        const enabled = await SettingsService.get('AUTO_ANALYZE_ENABLED');
        if (enabled !== 'true') return [];

        const thresholdStr = await SettingsService.get('AUTO_ANALYZE_THRESHOLD');
        const limitStr = await SettingsService.get('AUTO_ANALYZE_LIMIT_PER_BATCH');

        const VIRAL_THRESHOLD = thresholdStr ? parseInt(thresholdStr) : 100000; 
        const MAX_PER_BATCH = limitStr ? parseInt(limitStr) : 3; 
        
        const viralNotes = notes.filter(n => n.heat >= VIRAL_THRESHOLD);
        
        if (viralNotes.length === 0) return [];

        Logger.info('TrendService', `Found ${viralNotes.length} viral notes (>${VIRAL_THRESHOLD}). Checking for candidates...`);

        // Limit the number of analyses per batch
        const targetNotes = viralNotes.slice(0, MAX_PER_BATCH);
        const candidates = [];

        for (const note of targetNotes) {
            let noteId = note.url;
            const noteIdMatch = note.url.match(/\/(explore|discovery\/item)\/([a-zA-Z0-9]+)/);
            if (noteIdMatch && noteIdMatch[2]) {
                noteId = noteIdMatch[2];
            }

            // Check if already analyzed
            const existing = this.getNoteById(noteId);
            if (existing && existing.analysis_result) continue;

            candidates.push({
                noteId,
                title: note.title
            });
        }
        
        return candidates;
    }

    /**
     * Save external trends (Weibo, etc.)
     */
    static saveExternalTrends(source: string, trends: any[]) {
         db.prepare(`
            INSERT INTO trends (source, data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(source) DO UPDATE SET
            data = excluded.data,
            updated_at = CURRENT_TIMESTAMP
        `).run(source, JSON.stringify(trends));
        Logger.info('TrendService', `Saved external trends for: ${source}`);
    }

    // ==================== trending_notes 路由查询方法 ====================

    /**
     * 功能描述：分页查询热门笔记列表，支持多条件筛选与排序
     *
     * 参数说明：
     * - params: [object] 查询条件集合
     *   - page: [number] 页码，从 1 开始 [1]
     *   - limit: [number] 每页条数 [20]
     *   - sort: [string] 排序字段，'scraped_at' 或 'likes_count' ['scraped_at']
     *   - category: [string] 分类筛选，'all' 或具体分类名 [undefined]
     *   - search: [string] 搜索关键词（匹配标题/内容/作者）[undefined]
     *   - date: [string] 日期筛选 YYYY-MM-DD [undefined]
     *   - analyzed: [boolean] 是否只看已分析笔记 [false]
     *   - type: [string] 类型筛选 'all'|'video'|'image' [undefined]
     *
     * 返回说明：
     * - { data: any[], pagination: { page, limit, total, totalPages } }
     *
     * 使用示例：
     * >>> const result = TrendService.listTrendingNotes({ page: 1, limit: 20, sort: 'likes_count' });
     * >>> console.log(result.data.length);
     *
     * NOTE: 动态拼接 WHERE 条件时，所有用户输入均通过参数化查询绑定，避免 SQL 注入
     */
    static listTrendingNotes(params: {
        page: number;
        limit: number;
        sort?: string;
        category?: string;
        search?: string;
        date?: string;
        analyzed?: boolean;
        type?: string;
    }): { data: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } } {
        const { page, limit, sort, category, search, date, analyzed, type } = params;
        const offset = (page - 1) * limit;

        // 动态构建 WHERE 条件（参数化绑定，防止 SQL 注入）
        const whereConditions: string[] = [];
        const queryParams: any[] = [];

        if (category && category !== 'all') {
            whereConditions.push('category = ?');
            queryParams.push(category);
        }

        if (type && type !== 'all') {
            if (type === 'video') {
                whereConditions.push("(type = 'video' OR type = 'video_note')");
            } else if (type === 'image') {
                whereConditions.push("(type = 'image' OR type = 'normal' OR type IS NULL OR type = '')");
            }
        }

        if (analyzed) {
            whereConditions.push('analysis_result IS NOT NULL');
        }

        if (search) {
            whereConditions.push('(title LIKE ? OR content LIKE ? OR author_name LIKE ?)');
            const searchPattern = `%${search}%`;
            queryParams.push(searchPattern, searchPattern, searchPattern);
        }

        if (date) {
            whereConditions.push('scraped_at LIKE ?');
            queryParams.push(`${date}%`);
        }

        const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';
        const query = 'SELECT * FROM trending_notes' + whereClause;
        const countQuery = 'SELECT COUNT(*) as count FROM trending_notes' + whereClause;

        // 排序：likes_count 按点赞数倒序，其他默认按抓取时间倒序
        const orderBy = sort === 'likes_count' ? ' ORDER BY likes_count DESC' : ' ORDER BY scraped_at DESC';
        const finalQuery = query + orderBy + ' LIMIT ? OFFSET ?';

        const notes = db.prepare(finalQuery).all(...queryParams, limit, offset);
        const total = db.prepare(countQuery).get(...queryParams) as { count: number };

        return {
            data: notes,
            pagination: {
                page,
                limit,
                total: total.count,
                totalPages: Math.ceil(total.count / limit)
            }
        };
    }

    /**
     * 功能描述：从竞品笔记导入到 trending_notes 表（用于后续分析）
     *
     * 参数说明：
     * - note: [object] 竞品笔记数据，包含 note_id/title/cover_url 等字段
     *
     * 返回说明：
     * - { success: boolean, id: number, message: string } 导入结果
     *
     * 使用示例：
     * >>> const r = TrendService.importNote({ note_id: 'abc', title: '测试' });
     * >>> console.log(r.id);
     *
     * NOTE: 通过 note_id 唯一性约束避免重复导入
     */
    static importNote(note: {
        note_id: string;
        title?: string;
        cover_url?: string;
        author_name?: string;
        likes_count?: number;
        note_url?: string;
        type?: string;
        video_url?: string;
    }): { success: boolean; id: number | bigint; message: string } {
        // 检查是否已存在（按 note_id 去重）
        const existing = db.prepare('SELECT id FROM trending_notes WHERE note_id = ?').get(note.note_id) as { id: number } | undefined;

        if (existing) {
            return { success: true, id: existing.id, message: 'Note already exists' };
        }

        // 插入新记录，category 标记为 competitor_import 便于区分来源
        const result = db.prepare(`
            INSERT INTO trending_notes (
                note_id, title, cover_url, author_name, likes_count,
                note_url, type, video_url, scraped_at, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'competitor_import')
        `).run(
            note.note_id,
            note.title || 'Untitled',
            note.cover_url || '',
            note.author_name || 'Unknown',
            note.likes_count || 0,
            note.note_url || '',
            note.type || 'image',
            note.video_url || null
        );

        return { success: true, id: result.lastInsertRowid, message: 'Note imported' };
    }

    /**
     * 功能描述：根据数据库主键 id 获取单条热门笔记详情
     *
     * 参数说明：
     * - id: [number | string] 数据库主键 id
     *
     * 返回说明：
     * - any | undefined 笔记对象，不存在时返回 undefined
     */
    static getTrendingNoteById(id: number | string): any | undefined {
        return db.prepare('SELECT * FROM trending_notes WHERE id = ?').get(id) as any | undefined;
    }

    /**
     * 功能描述：根据 note_id（小红书原始笔记ID）获取笔记
     *
     * 参数说明：
     * - noteId: [string] 小红书原始笔记 ID
     */
    static getTrendingNoteByNoteId(noteId: string): any | undefined {
        return db.prepare('SELECT * FROM trending_notes WHERE note_id = ?').get(noteId) as any | undefined;
    }

    /**
     * 功能描述：根据数据库 id 查找对应的 note_id（小红书原始笔记ID）
     *
     * 参数说明：
     * - id: [number | string] 数据库主键 id
     *
     * 返回说明：
     * - { note_id: string } | undefined 笔记的原始 ID
     */
    static getNoteIdByDbId(id: number | string): { note_id: string } | undefined {
        return db.prepare('SELECT note_id FROM trending_notes WHERE id = ?').get(id) as { note_id: string } | undefined;
    }

    /**
     * 功能描述：获取指定 note_id 的分析结果（用于判断是否已分析）
     *
     * 参数说明：
     * - noteId: [string] 小红书原始笔记 ID
     *
     * 返回说明：
     * - { analysis_result: string | null } | undefined 分析结果 JSON 字符串
     */
    static getAnalysisResult(noteId: string): { analysis_result: string | null } | undefined {
        return db.prepare('SELECT analysis_result FROM trending_notes WHERE note_id = ?').get(noteId) as { analysis_result: string | null } | undefined;
    }

    /**
     * 功能描述：删除指定 id 的热门笔记
     *
     * 参数说明：
     * - id: [number | string] 数据库主键 id
     */
    static deleteTrendingNote(id: number | string): void {
        db.prepare('DELETE FROM trending_notes WHERE id = ?').run(id);
    }

    /**
     * 功能描述：批量删除热门笔记
     *
     * 参数说明：
     * - ids: [number[] | string[]] 数据库主键 id 数组
     *
     * 返回说明：
     * - number 实际删除的条数
     *
     * 异常情况：
     * - ids 为空数组时抛出错误，由调用方处理
     */
    static batchDeleteTrendingNotes(ids: (number | string)[]): number {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new Error('Invalid ids provided');
        }

        // 动态生成占位符，参数化绑定防止 SQL 注入
        const placeholders = ids.map(() => '?').join(',');
        const result = db.prepare(`DELETE FROM trending_notes WHERE id IN (${placeholders})`).run(...ids);
        return result.changes;
    }

    /**
     * 功能描述：刷新笔记（清空 content 强制重新抓取深度内容）
     *
     * 参数说明：
     * - id: [number | string] 数据库主键 id
     */
    static clearNoteContentForRefresh(id: number | string): void {
        db.prepare('UPDATE trending_notes SET content = NULL WHERE id = ?').run(id);
    }

    /**
     * 功能描述：更新笔记封面 URL（图片本地化后调用）
     *
     * 参数说明：
     * - id: [number] 数据库主键 id
     * - coverUrl: [string] 本地化后的封面 URL
     */
    static updateCoverUrl(id: number, coverUrl: string): void {
        db.prepare('UPDATE trending_notes SET cover_url = ? WHERE id = ?').run(coverUrl, id);
    }

    // ==================== trends 表（外部热点聚合）路由查询方法 ====================

    /**
     * 功能描述：获取指定来源的热点数据（用于路由 GET /api/trends）
     *
     * 参数说明：
     * - source: [string] 数据来源标识，如 'weibo'、'zhihu'
     *
     * 返回说明：
     * - { data: string, updated_at: string } | undefined
     *   - data: JSON 字符串，需调用方 JSON.parse
     *   - updated_at: UTC 时间字符串 'YYYY-MM-DD HH:MM:SS'
     *
     * NOTE: trends 表每个 source 仅一条记录（UPSERT 语义）
     */
    static getTrendsBySource(source: string): { data: string; updated_at: string } | undefined {
        return db.prepare('SELECT * FROM trends WHERE source = ?').get(source) as { data: string; updated_at: string } | undefined;
    }

    /**
     * 功能描述：检查指定来源的抓取任务是否已在队列中（避免重复入队）
     *
     * 参数说明：
     * - source: [string] 数据来源标识
     *
     * 返回说明：
     * - boolean true 表示已有相同来源的任务处于 PENDING 或 PROCESSING 状态
     *
     * NOTE: 任务 payload 是 JSON 字符串，需解析后比较 source 字段
     */
    static isTrendScrapeTaskQueued(source: string): boolean {
        const pendingTasks = db.prepare(`
            SELECT payload FROM tasks
            WHERE type = 'SCRAPE_TRENDS' AND (status = 'PENDING' OR status = 'PROCESSING')
        `).all() as Array<{ payload: string }>;

        return pendingTasks.some(t => {
            try {
                const p = JSON.parse(t.payload);
                return p.source === source;
            } catch (e) {
                return false;
            }
        });
    }
}
