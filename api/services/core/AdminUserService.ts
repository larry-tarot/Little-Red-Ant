/**
 * 文件功能：管理员账号（admin_users 表）Service 层，封装管理员账号的数据库操作
 * 主要类/函数：AdminUserService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';
import bcrypt from 'bcryptjs';

/**
 * 管理员账号基本信息（不含密码哈希）
 */
export interface AdminUser {
    id: number;
    username: string;
    role: string;
    alias: string;
    permissions: string[];
    is_active: number; // 0 / 1
    created_at: string;
    updated_at: string | null;
    password_changed_at: string | null;
    password_version: number;
}

/**
 * 把 DB 行里的 permissions 字符串解析为 string[]，
 * 容错处理 null / 非法 JSON。
 */
function parsePermissions(raw: any): string[] {
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export class AdminUserService {
    /**
     * 功能描述：获取所有管理员账号列表（按创建时间倒序）
     */
    static getAllAdminUsers(): AdminUser[] {
        const rows = db.prepare(
            'SELECT id, username, role, alias, permissions, is_active, created_at, updated_at, password_changed_at, password_version FROM admin_users ORDER BY created_at DESC'
        ).all() as any[];
        return rows.map(r => ({ ...r, permissions: parsePermissions(r.permissions) }));
    }

    /**
     * 功能描述：按 id 获取管理员账号（不含密码哈希）
     */
    static getAdminUserById(id: number | string): AdminUser | null {
        const row = db.prepare(
            'SELECT id, username, role, alias, permissions, is_active, created_at, updated_at, password_changed_at, password_version FROM admin_users WHERE id = ?'
        ).get(id) as any;
        if (!row) return null;
        return { ...row, permissions: parsePermissions(row.permissions) };
    }

    /**
     * 功能描述：创建新管理员账号（密码使用 bcrypt 哈希存储）
     */
    static async createAdminUser(
        username: string,
        password: string,
        role: string = 'editor',
        alias?: string,
        permissions?: string[]
    ): Promise<{ success: boolean; id?: number | bigint; error?: string }> {
        const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
        if (existing) {
            return { success: false, error: 'Username already exists' };
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const info = db.prepare(
            'INSERT INTO admin_users (username, password_hash, role, alias, permissions) VALUES (?, ?, ?, ?, ?)'
        ).run(username, hashedPassword, role, alias || username, JSON.stringify(permissions || []));

        return { success: true, id: info.lastInsertRowid };
    }

    /**
     * 功能描述：更新管理员账号的资料（alias / role / permissions）
     *
     * 返回说明：
     * - { success, error? } 不存在的用户返回 success=false
     */
    static updateAdminUser(
        id: number | string,
        updates: { alias?: string; role?: string; permissions?: string[] }
    ): { success: boolean; error?: string } {
        const existing = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(id);
        if (!existing) {
            return { success: false, error: 'User not found' };
        }

        const sets: string[] = [];
        const values: any[] = [];
        if (updates.alias !== undefined) {
            sets.push('alias = ?');
            values.push(updates.alias);
        }
        if (updates.role !== undefined) {
            sets.push('role = ?');
            values.push(updates.role);
        }
        if (updates.permissions !== undefined) {
            sets.push('permissions = ?');
            values.push(JSON.stringify(updates.permissions));
        }
        if (sets.length === 0) {
            return { success: true }; // 空更新直接返回成功
        }
        sets.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        db.prepare(`UPDATE admin_users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        return { success: true };
    }

    /**
     * 功能描述：管理员重置某用户的密码（不需要原密码）
     */
    static async adminResetPassword(id: number | string, newPassword: string): Promise<{ success: boolean; error?: string }> {
        const existing = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(id);
        if (!existing) {
            return { success: false, error: 'User not found' };
        }
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);
        db.prepare(
            "UPDATE admin_users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, password_version = password_version + 1 WHERE id = ?"
        ).run(hash, id);
        return { success: true };
    }

    /**
     * 功能描述：启用 / 停用账号（根管理员 id=1 不可停用）
     */
    static setUserActive(id: number | string, isActive: boolean): { success: boolean; error?: string } {
        if ((id === '1' || id === 1) && !isActive) {
            return { success: false, error: '不能停用根管理员' };
        }
        const existing = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(id);
        if (!existing) {
            return { success: false, error: 'User not found' };
        }
        db.prepare("UPDATE admin_users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(isActive ? 1 : 0, id);
        return { success: true };
    }

    /**
     * 功能描述：删除管理员账号（根管理员 id=1 禁止删除）
     */
    static deleteAdminUser(id: number | string): { success: boolean; error?: string } {
        if (id === '1' || id === 1) {
            return { success: false, error: 'Cannot delete root admin' };
        }
        const existing = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(id);
        if (!existing) {
            return { success: false, error: 'User not found' };
        }
        db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
        return { success: true };
    }
}
