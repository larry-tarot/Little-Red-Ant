import db from '../../db.js';
import fs from 'fs';
import path from 'path';
import { EncryptionService } from './EncryptionService.js';

/**
 * 文件功能：账号管理 Service 层，封装所有账号相关的数据库操作
 * 主要类/函数：AccountService
 */

export interface Account {
    id: number;
    nickname: string;
    alias: string;
    avatar: string;
    is_active: boolean;
    last_used_at: string;
    created_at: string;
    has_creator_cookie: boolean;
    has_main_cookie: boolean;
    status: string;
    persona: {
        desc: string;
        tone: string;
        sample: string;
        niche: string;
    };
}

export class AccountService {
    /**
     * 获取所有账号列表
     */
    static getAllAccounts(): Account[] {
        // Sprint 8: Use explicit column list — do NOT select cookie fields.
        // Instead, use EXISTS subqueries to expose only a boolean presence flag.
        // This prevents accidentally sending encrypted cookies to the client.
        const accounts = db.prepare(`
            SELECT id, nickname, alias, avatar, is_active, last_used_at, created_at,
                   status, persona_desc, tone, writing_sample, niche,
                   CASE WHEN creator_cookies IS NOT NULL OR cookies IS NOT NULL THEN 1 ELSE 0 END AS has_creator_cookie,
                   CASE WHEN main_site_cookies IS NOT NULL THEN 1 ELSE 0 END AS has_main_cookie
            FROM accounts ORDER BY created_at DESC
        `).all() as any[];

        return accounts.map((acc: any) => ({
            id: acc.id,
            nickname: acc.nickname,
            alias: acc.alias,
            avatar: acc.avatar,
            is_active: Boolean(acc.is_active),
            last_used_at: acc.last_used_at,
            created_at: acc.created_at,
            has_creator_cookie: !!acc.has_creator_cookie,
            has_main_cookie: !!acc.has_main_cookie,
            status: acc.status || 'UNKNOWN',
            persona: {
                desc: acc.persona_desc,
                tone: acc.tone,
                sample: acc.writing_sample,
                niche: acc.niche
            }
        }));
    }

    /**
     * 更新账号别名
     */
    static updateAlias(id: string, alias: string): void {
        db.prepare('UPDATE accounts SET alias = ? WHERE id = ?').run(alias, id);
    }

    /**
     * 更新账号人设
     */
    static updatePersona(id: string, data: {
        niche: string;
        persona_desc: string;
        tone: string;
        writing_sample: string;
    }): void {
        db.prepare(`
            UPDATE accounts 
            SET niche = ?, persona_desc = ?, tone = ?, writing_sample = ? 
            WHERE id = ?
        `).run(data.niche, data.persona_desc, data.tone, data.writing_sample, id);
    }

    /**
     * 获取登录状态（包含活跃账号信息）
     */
    static getLoginStatus() {
        const activeAccount = db.prepare('SELECT id, nickname FROM accounts WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1').get();
        return { activeAccount };
    }

    /**
     * 获取主账号状态
     */
    static getPrimaryStatus(): any {
        return db.prepare('SELECT id, nickname, avatar, status FROM accounts WHERE is_active = 1 LIMIT 1').get();
    }

    /**
     * 切换活跃账号
     */
    static switchActiveAccount(id: string): void {
        db.transaction(() => {
            db.prepare('UPDATE accounts SET is_active = 0').run();
            db.prepare('UPDATE accounts SET is_active = 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
        })();
    }

    /**
     * 删除账号及其关联数据
     */
    static deleteAccount(id: string): { profile_path?: string } {
        const account = db.prepare('SELECT profile_path FROM accounts WHERE id = ?').get(id) as { profile_path: string } | undefined;

        db.transaction(() => {
            // 1. 获取所有笔记ID
            const notes = db.prepare('SELECT note_id FROM note_stats WHERE account_id = ?').all(id) as { note_id: string }[];
            
            if (notes.length > 0) {
                const noteIds = notes.map(n => n.note_id);
                const deleteHistoryStmt = db.prepare('DELETE FROM note_stats_history WHERE note_id = ?');
                noteIds.forEach(noteId => deleteHistoryStmt.run(noteId));
            }

            // 2. 删除统计数据
            db.prepare('DELETE FROM note_stats WHERE account_id = ?').run(id);

            // 3. 删除评论
            db.prepare('DELETE FROM comments WHERE account_id = ?').run(id);

            // 4. 删除关联任务
            db.prepare(`
                DELETE FROM tasks 
                WHERE payload LIKE ? OR payload LIKE ?
            `).run(`%"accountId":${id}%`, ` "%accountId":"${id}"%`);

            // 5. 删除账号
            db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
        })();

        return { profile_path: account?.profile_path };
    }

    /**
     * 获取账号 Cookie
     */
    static getAccountCookies(id: number): { creator_cookies?: string; main_site_cookies?: string } | null {
        return db.prepare('SELECT creator_cookies, main_site_cookies FROM accounts WHERE id = ?').get(id) as any;
    }

    /**
     * 更新账号 Cookie
     */
    static updateCookies(id: number, data: {
        creator_cookies?: string;
        main_site_cookies?: string;
        cookies?: string;
    }): void {
        const fields: string[] = [];
        const values: any[] = [];
        
        if (data.creator_cookies !== undefined) {
            fields.push('creator_cookies = ?');
            values.push(data.creator_cookies);
        }
        if (data.main_site_cookies !== undefined) {
            fields.push('main_site_cookies = ?');
            values.push(data.main_site_cookies);
        }
        if (data.cookies !== undefined) {
            fields.push('cookies = ?');
            values.push(data.cookies);
        }
        
        if (fields.length > 0) {
            values.push(id);
            db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        }
    }

    /**
     * 获取活跃账号 ID
     */
    static getActiveAccountId(): number | undefined {
        const result = db.prepare('SELECT id FROM accounts WHERE is_active = 1').get() as { id: number } | undefined;
        return result?.id;
    }

    /**
     * 功能描述：获取活跃账号的基本信息（id + nickname）
     *
     * 返回说明：
     * - { id: number, nickname: string } | undefined 活跃账号信息，无活跃账号时返回 undefined
     *
     * 使用示例：
     * >>> const account = AccountService.getActiveAccount();
     * >>> if (!account) return res.json({ account_name: 'No Active Account' });
     */
    static getActiveAccount(): { id: number, nickname: string } | undefined {
        return db.prepare('SELECT id, nickname FROM accounts WHERE is_active = 1').get() as { id: number, nickname: string } | undefined;
    }

    /**
     * 获取所有有 Cookie 的账号（用于健康检查）
     */
    static getAccountsWithCookies(): any[] {
        return db.prepare('SELECT id, nickname, creator_cookies, main_site_cookies FROM accounts WHERE is_active = 1 OR creator_cookies IS NOT NULL OR main_site_cookies IS NOT NULL').all() as any[];
    }

    /**
     * 清除指定账号的 creator_cookies
     */
    static clearCreatorCookies(id: number): void {
        db.prepare("UPDATE accounts SET creator_cookies = NULL WHERE id = ?").run(id);
    }

    /**
     * 清除指定账号的 main_site_cookies
     */
    static clearMainSiteCookies(id: number): void {
        db.prepare("UPDATE accounts SET main_site_cookies = NULL WHERE id = ?").run(id);
    }

    /**
     * 更新账号的 user_id
     */
    static updateUserId(id: number, userId: string): void {
        db.prepare('UPDATE accounts SET user_id = ? WHERE id = ?').run(userId, id);
    }
}
