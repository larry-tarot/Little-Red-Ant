/**
 * AuthService.login / changeOwnPassword 单测
 *
 * NOTE: bcrypt.hash 是异步的，但 vitest handler 必须是同步函数；
 * 所以每个用例先 await 预生成哈希，再注入 handler。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const handlers: Array<{ match: (sql: string) => boolean; get?: any; run?: any; all?: any }> = [];

vi.mock('../../api/db.js', () => {
    return {
        default: {
            prepare: vi.fn((sql: string) => {
                const h = handlers.find(x => x.match(sql));
                if (!h) {
                    return {
                        get: () => undefined,
                        run: () => ({ changes: 0 }),
                        all: () => [],
                    };
                }
                return {
                    get: vi.fn((...args) => h.get ? h.get(...args) : undefined),
                    run: vi.fn((...args) => h.run ? h.run(...args) : { changes: 1 }),
                    all: vi.fn(() => h.all ?? []),
                };
            }),
        },
    };
});

import { AuthService } from '../../api/services/core/AuthService.js';

describe('AuthService.login', () => {
    beforeEach(() => {
        handlers.length = 0;
    });

    it('用户不存在返回 USER_NOT_FOUND', async () => {
        handlers.push({
            match: (sql) => sql.includes('FROM admin_users WHERE username'),
            get: () => undefined,
        });
        const r = await AuthService.login('nobody', 'any');
        expect(r.success).toBe(false);
        expect(r.error).toBe('USER_NOT_FOUND');
    });

    it('账号被停用返回 ACCOUNT_DISABLED', async () => {
        const passwordHash = await bcrypt.hash('p', 4);
        handlers.push({
            match: (sql) => sql.includes('FROM admin_users WHERE username'),
            get: () => ({ id: 5, username: 'bob', password_hash: passwordHash, role: 'editor', alias: null, permissions: null, is_active: 0 }),
        });
        const r = await AuthService.login('bob', 'p');
        expect(r.success).toBe(false);
        expect(r.error).toBe('ACCOUNT_DISABLED');
    });

    it('密码错误返回 INVALID_PASSWORD', async () => {
        const passwordHash = await bcrypt.hash('correct', 4);
        handlers.push({
            match: (sql) => sql.includes('FROM admin_users WHERE username'),
            get: () => ({ id: 5, username: 'bob', password_hash: passwordHash, role: 'editor', alias: 'B', permissions: null, is_active: 1 }),
        });
        const r = await AuthService.login('bob', 'wrong');
        expect(r.success).toBe(false);
        expect(r.error).toBe('INVALID_PASSWORD');
    });

    it('成功登录返回 user（包含 alias / role / permissions 数组）', async () => {
        const passwordHash = await bcrypt.hash('correct', 4);
        handlers.push({
            match: (sql) => sql.includes('FROM admin_users WHERE username'),
            get: () => ({
                id: 5,
                username: 'bob',
                password_hash: passwordHash,
                role: 'editor',
                alias: 'Bob',
                permissions: JSON.stringify(['publish_content']),
                is_active: 1,
            }),
        });
        const r = await AuthService.login('bob', 'correct');
        expect(r.success).toBe(true);
        expect(r.user).toEqual({
            id: 5,
            username: 'bob',
            alias: 'Bob',
            role: 'editor',
            permissions: ['publish_content'],
            password_version: 1,
        });
    });

    it('permissions 字段为非法 JSON 时回退为空数组', async () => {
        const passwordHash = await bcrypt.hash('correct', 4);
        handlers.push({
            match: (sql) => sql.includes('FROM admin_users WHERE username'),
            get: () => ({
                id: 5,
                username: 'bob',
                password_hash: passwordHash,
                role: 'editor',
                alias: null,
                permissions: 'not-json',
                is_active: 1,
            }),
        });
        const r = await AuthService.login('bob', 'correct');
        expect(r.success).toBe(true);
        expect(r.user?.permissions).toEqual([]);
        expect(r.user?.alias).toBeNull();
    });
});

describe('AuthService.changeOwnPassword', () => {
    beforeEach(() => {
        handlers.length = 0;
    });

    it('用户不存在返回 USER_NOT_FOUND', async () => {
        handlers.push({
            match: (sql) => sql.includes('SELECT password_hash FROM admin_users WHERE id'),
            get: () => undefined,
        });
        const r = await AuthService.changeOwnPassword(99, 'a', 'b');
        expect(r.success).toBe(false);
        expect(r.error).toBe('USER_NOT_FOUND');
    });

    it('原密码错误返回 INVALID_OLD_PASSWORD', async () => {
        const passwordHash = await bcrypt.hash('real-old', 4);
        handlers.push({
            match: (sql) => sql.includes('SELECT password_hash FROM admin_users WHERE id'),
            get: () => ({ password_hash: passwordHash }),
        });
        const r = await AuthService.changeOwnPassword(5, 'wrong', 'newpass1');
        expect(r.success).toBe(false);
        expect(r.error).toBe('INVALID_OLD_PASSWORD');
    });

    it('原密码正确时更新哈希并标记 password_changed_at', async () => {
        const passwordHash = await bcrypt.hash('old-pwd', 4);
        let runCalled = 0;
        handlers.push({
            match: (sql) => sql.includes('SELECT password_hash FROM admin_users WHERE id'),
            get: () => ({ password_hash: passwordHash }),
        });
        handlers.push({
            match: (sql) => sql.includes('UPDATE admin_users SET password_hash'),
            run: (hash: string, id: number) => {
                runCalled++;
                expect(hash).toMatch(/^\$2[aby]\$/);
                expect(id).toBe(5);
                return { changes: 1 };
            },
        });
        const r = await AuthService.changeOwnPassword(5, 'old-pwd', 'new-pwd-1');
        expect(r.success).toBe(true);
        expect(runCalled).toBe(1);
    });
});
