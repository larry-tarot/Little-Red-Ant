/**
 * 文件功能：评论管理（comments 表）Service 层，封装评论查询逻辑
 * 主要类/函数：CommentService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';
import { AccountService } from './AccountService.js';

export class CommentService {
    /**
     * 功能描述：分页查询评论，支持按状态和账号筛选
     *
     * 参数说明：
     * - params: [object] 查询参数
     *   - status: [string] 回复状态筛选（'ALL' 表示不筛选）
     *   - page: [number] 页码
     *   - pageSize: [number] 每页条数
     *   - accountId: [string | undefined] 账号 ID 筛选
     *
     * 返回说明：
     * - { data: any[], pagination: {...}, activeAccountId: any }
     *
     * NOTE: 未传 accountId 时，自动跟随当前激活的账号（业务规则：跟随账号）
     */
    static listComments(params: {
        status?: string;
        page: number;
        pageSize: number;
        accountId?: string;
    }): { data: any[]; pagination: { total: number; page: number; pageSize: number; totalPages: number }; activeAccountId: any } {
        const { status, page, pageSize, accountId } = params;
        const offset = (page - 1) * pageSize;

        const whereClauses: string[] = [];
        const queryParams: (string | number)[] = [];

        // 1. 按状态筛选
        if (status && status !== 'ALL') {
            whereClauses.push('reply_status = ?');
            queryParams.push(status);
        }

        // 2. 按账号筛选：未传 accountId 时，使用当前激活账号
        let targetAccountId: any = accountId;
        if (!targetAccountId) {
            const activeAccount = AccountService.getActiveAccount();
            if (activeAccount) {
                targetAccountId = activeAccount.id;
            }
        }

        if (targetAccountId) {
            whereClauses.push('account_id = ?');
            queryParams.push(targetAccountId);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 查询分页数据
        const comments = db.prepare(`
            SELECT * FROM comments
            ${whereSql}
            ORDER BY create_time DESC
            LIMIT ? OFFSET ?
        `).all(...queryParams, pageSize, offset);

        // 查询总数
        const countResult = db.prepare(`
            SELECT COUNT(*) as count FROM comments
            ${whereSql}
        `).get(...queryParams) as { count: number };

        return {
            data: comments,
            pagination: {
                total: countResult.count,
                page,
                pageSize,
                totalPages: Math.ceil(countResult.count / pageSize)
            },
            activeAccountId: targetAccountId
        };
    }

    static getCommentById(id: string) {
        return db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;
    }

    static updateCommentAnalysis(id: string, intent: string, suggestion: string) {
        db.prepare('UPDATE comments SET intent = ?, ai_reply_suggestion = ? WHERE id = ?').run(intent, suggestion, id);
    }
}
