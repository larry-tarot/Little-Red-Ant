/**
 * 文件功能：笔记管理（note_stats 表）Service 层，封装已发布笔记的查询和删除
 * 主要类/函数：NoteService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

export class NoteService {
    /**
     * 功能描述：分页查询笔记列表，支持按账号和关键词筛选
     *
     * 参数说明：
     * - page: [number] 页码
     * - pageSize: [number] 每页条数
     * - accountId: [string | undefined] 账号 ID 筛选
     * - keyword: [string | undefined] 标题关键词搜索
     *
     * 返回说明：
     * - { data: any[], total: number, page: number, pageSize: number }
     *
     * NOTE: 关联查询 accounts 和 video_projects 表，获取账号名和项目信息
     */
    static listNotes(page: number, pageSize: number, accountId?: string, keyword?: string): { data: any[]; total: number; page: number; pageSize: number } {
        const offset = (page - 1) * pageSize;

        // 动态构建查询（关联账号和视频项目）
        let query = `
            SELECT
                ns.*,
                a.nickname as account_name,
                a.avatar as account_avatar,
                vp.id as project_id,
                vp.title as project_title
            FROM note_stats ns
            LEFT JOIN accounts a ON ns.account_id = a.id
            LEFT JOIN video_projects vp ON ns.note_id = vp.note_id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (accountId) {
            query += ` AND ns.account_id = ?`;
            params.push(accountId);
        }

        if (keyword) {
            query += ` AND ns.title LIKE ?`;
            params.push(`%${keyword}%`);
        }

        query += ` ORDER BY ns.publish_date DESC LIMIT ? OFFSET ?`;
        params.push(pageSize, offset);

        const notes = db.prepare(query).all(...params);

        // 查询总数（相同的 WHERE 条件）
        let countQuery = `SELECT COUNT(*) as total FROM note_stats ns WHERE 1=1`;
        const countParams: any[] = [];

        if (accountId) {
            countQuery += ` AND ns.account_id = ?`;
            countParams.push(accountId);
        }
        if (keyword) {
            countQuery += ` AND ns.title LIKE ?`;
            countParams.push(`%${keyword}%`);
        }

        const total = (db.prepare(countQuery).get(...countParams) as any).total;

        return { data: notes, total, page, pageSize };
    }

    /**
     * 功能描述：根据 note_id 获取笔记的 account_id（用于删除时确定使用哪个账号）
     *
     * 参数说明：
     * - noteId: [string] 笔记 ID
     *
     * 返回说明：
     * - { account_id: number } | undefined
     */
    static getNoteAccountId(noteId: string): { account_id: number } | undefined {
        return db.prepare('SELECT account_id FROM note_stats WHERE note_id = ?').get(noteId) as { account_id: number } | undefined;
    }

    /**
     * 功能描述：获取笔记的封面图片路径（用于删除时清理本地文件）
     *
     * 参数说明：
     * - noteId: [string] 笔记 ID
     *
     * 返回说明：
     * - { cover_image: string | null } | undefined
     */
    static getNoteCoverImage(noteId: string): { cover_image: string | null } | undefined {
        return db.prepare('SELECT cover_image FROM note_stats WHERE note_id = ?').get(noteId) as { cover_image: string | null } | undefined;
    }

    /**
     * 功能描述：删除笔记记录（仅删除本地数据库记录，不删除平台笔记）
     *
     * 参数说明：
     * - noteId: [string] 笔记 ID
     *
     * NOTE: TODO 实现 RPA 删除平台笔记后，此方法需扩展
     */
    static deleteNote(noteId: string): void {
        db.prepare('DELETE FROM note_stats WHERE note_id = ?').run(noteId);
    }
}
