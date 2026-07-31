/**
 * 文件功能：登录失败计数与账号锁定服务
 * 使用场景：防暴力破解 / 防密码喷洒
 *
 * 核心策略：
 * - 每个 username 独立计数
 * - 5 分钟内失败达到 MAX_ATTEMPTS(默认 5) 次，锁定 LOCKOUT_MINUTES(默认 15) 分钟
 * - 成功登录、锁定到期后清零
 * - 基于 SQLite，单机多进程安全（单文件数据库 + busy timeout）
 */
import db from '../../db.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MINUTES = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

export class LoginAttemptService {
    private static maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || String(DEFAULT_MAX_ATTEMPTS), 10);
    private static windowMinutes = parseInt(process.env.LOGIN_WINDOW_MINUTES || String(DEFAULT_WINDOW_MINUTES), 10);
    private static lockoutMinutes = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || String(DEFAULT_LOCKOUT_MINUTES), 10);

    /**
     * 检查当前账号是否被锁定
     * @returns { isLocked: boolean, remainingSeconds?: number }
     */
    static isLocked(username: string): { isLocked: boolean; remainingSeconds?: number } {
        const row = db.prepare(
            'SELECT failed_count, locked_until, last_attempt_at FROM login_attempts WHERE username = ?'
        ).get(username) as {
            failed_count: number;
            locked_until: string | null;
            last_attempt_at: string | null;
        } | undefined;

        if (!row) return { isLocked: false };

        const now = new Date();
        if (row.locked_until) {
            const lockedUntil = new Date(row.locked_until);
            if (lockedUntil > now) {
                return {
                    isLocked: true,
                    remainingSeconds: Math.max(0, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000))
                };
            }
        }

        // 如果窗口期外没有新失败，则过期清零
        if (row.last_attempt_at) {
            const lastAttempt = new Date(row.last_attempt_at);
            const windowMs = this.windowMinutes * 60 * 1000;
            if (now.getTime() - lastAttempt.getTime() > windowMs) {
                this.clear(username);
                return { isLocked: false };
            }
        }

        return { isLocked: false };
    }

    /**
     * 记录一次登录失败
     */
    static recordFailure(username: string): { isLocked: boolean; remainingSeconds?: number } {
        const now = new Date();
        const row = db.prepare('SELECT failed_count FROM login_attempts WHERE username = ?').get(username) as
            { failed_count: number } | undefined;

        const newCount = (row?.failed_count || 0) + 1;
        const shouldLock = newCount >= this.maxAttempts;

        const lockedUntil = shouldLock
            ? new Date(now.getTime() + this.lockoutMinutes * 60 * 1000).toISOString()
            : null;

        db.prepare(
            `INSERT INTO login_attempts (username, failed_count, locked_until, last_attempt_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(username) DO UPDATE SET
                 failed_count = excluded.failed_count,
                 locked_until = excluded.locked_until,
                 last_attempt_at = excluded.last_attempt_at`
        ).run(username, newCount, lockedUntil, now.toISOString());

        if (shouldLock) {
            console.warn(`[Security] Account ${username} locked until ${lockedUntil} after ${newCount} failed login attempts.`);
            return {
                isLocked: true,
                remainingSeconds: this.lockoutMinutes * 60
            };
        }
        return { isLocked: false };
    }

    /**
     * 登录成功后清零
     */
    static clear(username: string): void {
        db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);
    }

    /**
     * 获取当前失败次数（用于日志 / 管理）
     */
    static getStatus(username: string): { failed_count: number; locked_until: string | null } {
        const row = db.prepare(
            'SELECT failed_count, locked_until FROM login_attempts WHERE username = ?'
        ).get(username) as { failed_count: number; locked_until: string | null } | undefined;
        return row || { failed_count: 0, locked_until: null };
    }
}
