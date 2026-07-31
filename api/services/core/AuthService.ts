/**
 * 文件功能：认证 Service 层，封装系统初始化检查和注册逻辑
 * 主要类/函数：AuthService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';
import bcrypt from 'bcryptjs';
import { LoginAttemptService } from './LoginAttemptService.js';

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

    /**
     * 功能描述：用户登录校验
     *
     * 参数说明：
     * - username: [string] 用户名
     * - password: [string] 明文密码
     *
     * 返回说明：
     * - { success: true, user } 登录成功
     * - { success: false, error } 失败原因：
     *   - 'USER_NOT_FOUND' 用户不存在
     *   - 'ACCOUNT_DISABLED' 账号已停用
     *   - 'INVALID_PASSWORD' 密码错误
     *
     * NOTE: 与原 login 逻辑相比，额外检查 is_active 字段。
     */
    static async login(username: string, password: string): Promise<{
        success: boolean;
        user?: { id: number; username: string; alias: string | null; role: string; permissions: string[]; password_version: number };
        error?: string;
        lockRemainingSeconds?: number;
    }> {
        // 1. 检查账号是否被锁定
        const lockStatus = LoginAttemptService.isLocked(username);
        if (lockStatus.isLocked) {
            return { success: false, error: 'ACCOUNT_LOCKED', lockRemainingSeconds: lockStatus.remainingSeconds };
        }

        const row = db.prepare(
            'SELECT id, username, password_hash, role, alias, permissions, is_active, password_version FROM admin_users WHERE username = ?'
        ).get(username) as any;

        if (!row) {
            return { success: false, error: 'USER_NOT_FOUND' };
        }
        if (row.is_active === 0) {
            return { success: false, error: 'ACCOUNT_DISABLED' };
        }

        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) {
            return { success: false, error: 'INVALID_PASSWORD' };
        }

        let perms: string[] = [];
        try {
            perms = row.permissions ? JSON.parse(row.permissions) : [];
        } catch {
            perms = [];
        }

        return {
            success: true,
            user: {
                id: row.id,
                username: row.username,
                alias: row.alias ?? null,
                role: row.role,
                permissions: perms,
                password_version: row.password_version ?? 1
            }
        };
    }

    /**
     * 功能描述：用户修改自己的密码
     *
     * 参数说明：
     * - userId: [number] 当前用户 id
     * - oldPassword: [string] 原密码（用于二次校验）
     * - newPassword: [string] 新密码
     *
     * 返回说明：
     * - { success: true } 修改成功
     * - { success: false, error } 错误信息
     */
    static async changeOwnPassword(userId: number, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
        const row = db.prepare('SELECT password_hash FROM admin_users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
        if (!row) {
            return { success: false, error: 'USER_NOT_FOUND' };
        }

        const ok = await bcrypt.compare(oldPassword, row.password_hash);
        if (!ok) {
            return { success: false, error: 'INVALID_OLD_PASSWORD' };
        }

        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);

        db.prepare(
            "UPDATE admin_users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, password_version = password_version + 1 WHERE id = ?"
        ).run(newHash, userId);

        return { success: true };
    }
}
