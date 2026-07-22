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
    created_at: string;
}

export class AdminUserService {
    /**
     * 功能描述：获取所有管理员账号列表（按创建时间倒序）
     *
     * 返回说明：
     * - AdminUser[] 管理员账号数组（不含密码哈希等敏感字段）
     *
     * 使用示例：
     * >>> const users = AdminUserService.getAllAdminUsers();
     * >>> console.log(users.length);
     */
    static getAllAdminUsers(): AdminUser[] {
        // 仅查询非敏感字段，密码哈希不返回
        return db.prepare('SELECT id, username, role, alias, created_at FROM admin_users ORDER BY created_at DESC').all() as AdminUser[];
    }

    /**
     * 功能描述：创建新管理员账号（密码使用 bcrypt 哈希存储）
     *
     * 参数说明：
     * - username: [string] 用户名
     * - password: [string] 明文密码
     * - role: [string] 角色，默认 'editor'
     * - alias: [string] 别名，默认与用户名相同
     *
     * 返回说明：
     * - { success: boolean, id?: number | bigint, error?: string }
     *
     * 异常情况：
     * - 用户名已存在时返回 { success: false, error: 'Username already exists' }
     */
    static async createAdminUser(username: string, password: string, role: string = 'editor', alias?: string): Promise<{ success: boolean; id?: number | bigint; error?: string }> {
        // 检查用户名是否已存在
        const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
        if (existing) {
            return { success: false, error: 'Username already exists' };
        }

        // bcrypt 加盐哈希（salt rounds 10 是安全与性能的平衡点）
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const info = db.prepare('INSERT INTO admin_users (username, password_hash, role, alias) VALUES (?, ?, ?, ?)')
            .run(username, hashedPassword, role, alias || username);

        return { success: true, id: info.lastInsertRowid };
    }

    /**
     * 功能描述：更新管理员账号的角色和别名
     *
     * 参数说明：
     * - id: [number] 管理员账号 ID
     * - role: [string] 新角色
     * - alias: [string] 新别名
     */
    static updateAdminUser(id: number, role: string, alias: string): void {
        db.prepare('UPDATE admin_users SET role = ?, alias = ? WHERE id = ?').run(role, alias, id);
    }

    /**
     * 功能描述：删除管理员账号（根管理员 id=1 禁止删除）
     *
     * 参数说明：
     * - id: [number] 管理员账号 ID
     *
     * 返回说明：
     * - { success: boolean, error?: string } 根管理员返回错误
     *
     * NOTE: 根管理员（id=1）是系统初始账号，删除会导致无法管理
     */
    static deleteAdminUser(id: number | string): { success: boolean; error?: string } {
        // 根管理员保护：禁止删除 id=1 的账号
        if (id === '1' || id === 1) {
            return { success: false, error: 'Cannot delete root admin' };
        }

        db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
        return { success: true };
    }
}
