/**
 * 文件功能：认证 Service 层，封装系统初始化检查和注册逻辑
 * 主要类/函数：AuthService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';
import bcrypt from 'bcryptjs';

export class AuthService {
    /**
     * 功能描述：检查系统是否已初始化（是否存在管理员账号）
     *
     * 返回说明：
     * - boolean true 表示已有管理员，false 表示系统未初始化
     *
     * 使用示例：
     * >>> const initialized = AuthService.isSystemInitialized();
     * >>> if (!initialized) // 引导用户完成初始化注册
     */
    static isSystemInitialized(): boolean {
        const count = db.prepare('SELECT COUNT(*) as c FROM admin_users').get() as { c: number };
        return count.c > 0;
    }

    /**
     * 功能描述：注册首个管理员账号（仅在系统未初始化时允许）
     *
     * 参数说明：
     * - username: [string] 用户名
     * - password: [string] 明文密码
     *
     * 返回说明：
     * - { success: boolean, userId?: number | bigint, error?: string }
     *
     * 异常情况：
     * - 系统已初始化：{ success: false, error: 'System already initialized...' }
     * - 用户名已存在：{ success: false, error: 'Username already exists' }
     *
     * NOTE: 首个注册用户固定为 admin 角色，后续账号通过 users 路由创建
     */
    static async registerFirstAdmin(username: string, password: string): Promise<{ success: boolean; userId?: number | bigint; error?: string }> {
        // 安全检查：仅允许在无用户时注册（系统初始化）
        if (this.isSystemInitialized()) {
            return { success: false, error: 'System already initialized. Please ask an admin to create an account.' };
        }

        // 检查用户名是否已存在（双重保险）
        const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
        if (existing) {
            return { success: false, error: 'Username already exists' };
        }

        // bcrypt 加盐哈希
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 首个用户固定为 admin 角色
        const info = db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)')
            .run(username, hashedPassword, 'admin');

        return { success: true, userId: info.lastInsertRowid };
    }
}
