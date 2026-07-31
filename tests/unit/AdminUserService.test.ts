/**
 * AdminUserService 单测
 * 覆盖：创建 / 启用-停用 / 重置密码 / 修改资料 / 删除保护
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 准备 mock：db.js 导出 default（better-sqlite3 实例），但每个 prepared statement
// 是动态的（get / run / all）。我们用一个简单的 handler 拦截 SQL。
const handlers: Array<{ match: (sql: string) => boolean; get?: any; run?: any; all?: any }> = [];

vi.mock('../../api/db.js', () => {
    return {
        default: {
            prepare: vi.fn((sql: string) => {
                const h = handlers.find(x => x.match(sql));
                if (!h) {
                    // 兜底：未注册的 SQL 返回 noop
                    return {
                        get: () => undefined,
                        run: () => ({ changes: 0, lastInsertRowid: 0 }),
                        all: () => [],
                    };
                }
                return {
                    get: vi.fn((...args) => h.get ? h.get(...args) : undefined),
                    // 直接调用 h.run，让 callback 抛出的 AssertionError 透传到测试
                    run: vi.fn((...args) => {
                        const r = h.run ? h.run(...args) : undefined;
                        return r ?? { changes: 1, lastInsertRowid: 0 };
                    }),
                    all: vi.fn(() => {
                        const v = h.all;
                        return typeof v === 'function' ? v() : (v ?? []);
                    }),
                };
            }),
        },
    };
});

import { AdminUserService } from '../../api/services/core/AdminUserService.js';

describe('AdminUserService', () => {
    beforeEach(() => {
        handlers.length = 0;
        vi.clearAllMocks();
    });

    it('createAdminUser: 用户名已存在时返回 success=false', async () => {
        handlers.push({
            match: (sql) => sql.includes('SELECT id FROM admin_users WHERE username = ?'),
            get: () => ({ id: 1 }),
        });
        const result = await AdminUserService.createAdminUser('admin', 'newpass', 'editor');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Username already exists');
    });

    it('createAdminUser: 正常路径写库并返回 lastInsertRowid', async () => {
        handlers.push({
            match: (sql) => sql.includes('SELECT id FROM admin_users WHERE username = ?'),
            get: () => undefined,
        });
        handlers.push({
            match: (sql) => sql.includes('INSERT INTO admin_users'),
            run: (username: string, _hash: string, role: string, alias: string, perms: string) => {
                expect(username).toBe('alice');
                expect(role).toBe('editor');
                expect(alias).toBe('Alice');
                expect(JSON.parse(perms)).toEqual(['publish_content']);
                return { changes: 1, lastInsertRowid: 42 };
            },
        });
        const result = await AdminUserService.createAdminUser('alice', 'pass1234', 'editor', 'Alice', ['publish_content']);
        expect(result.success).toBe(true);
        expect(Number(result.id)).toBe(42);
    });

    it('setUserActive: 根管理员不可停用', () => {
        const result = AdminUserService.setUserActive(1, false);
        expect(result.success).toBe(false);
        expect(result.error).toContain('根管理员');
    });

    it('setUserActive: 正常用户可停用 / 启用', () => {
        let setActiveCalled = 0;
        handlers.push({
            match: (sql) => sql.includes('SELECT id FROM admin_users WHERE id = ?'),
            get: () => ({ id: 5 }),
        });
        handlers.push({
            match: (sql) => sql.includes('UPDATE admin_users SET is_active'),
            run: (val: number) => { expect(val).toBe(0); setActiveCalled++; return { changes: 1 }; },
        });
        const result = AdminUserService.setUserActive(5, false);
        expect(result.success).toBe(true);
        expect(setActiveCalled).toBe(1);
    });

    it('updateAdminUser: 用户不存在时返回失败', () => {
        handlers.push({
            match: (sql) => sql.includes('SELECT id FROM admin_users WHERE id = ?'),
            get: () => undefined,
        });
        const result = AdminUserService.updateAdminUser(99, { alias: 'X' });
        expect(result.success).toBe(false);
        expect(result.error).toBe('User not found');
    });

    it('updateAdminUser: 至少需要传一个字段', () => {
        handlers.push({
            match: (sql) => sql.includes('SELECT id FROM admin_users WHERE id = ?'),
            get: () => ({ id: 2 }),
        });
        // 不注册 UPDATE handler — 即便走到也是 noop
        const result = AdminUserService.updateAdminUser(2, {});
        expect(result.success).toBe(true);
    });

    it('updateAdminUser: 正确序列化 permissions', () => {
        let updateParams: any = null;
        handlers.push({
            match: (sql) => sql.includes('SELECT id FROM admin_users WHERE id = ?'),
            get: () => ({ id: 2 }),
        });
        handlers.push({
            match: (sql) => sql.includes('UPDATE admin_users SET'),
            run: (...args: any[]) => { updateParams = args; return { changes: 1 }; },
        });
        AdminUserService.updateAdminUser(2, { role: 'editor', permissions: ['a', 'b'] });
        expect(updateParams).toBeTruthy();
        // 最后是 id（updated_at 由 SQL 拼接而非占位符）
        const sets = updateParams.slice(0, -1);
        expect(sets).toContain('editor');
        expect(sets).toContain(JSON.stringify(['a', 'b']));
    });

    it('deleteAdminUser: 根管理员受保护', () => {
        const result = AdminUserService.deleteAdminUser(1);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Cannot delete root admin');
    });

    it('deleteAdminUser: 字符串 "1" 同样受保护', () => {
        const result = AdminUserService.deleteAdminUser('1');
        expect(result.success).toBe(false);
    });

    it('adminResetPassword: 写库并更新时间戳', async () => {
        let runCalled = 0;
        handlers.push({
            match: (sql) => sql.includes('SELECT id FROM admin_users WHERE id = ?'),
            get: () => ({ id: 3 }),
        });
        handlers.push({
            match: (sql) => sql.includes('UPDATE admin_users SET password_hash'),
            run: (hash: string, id: number) => {
                expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt 哈希前缀
                expect(id).toBe(3);
                runCalled++;
                return { changes: 1 };
            },
        });
        const result = await AdminUserService.adminResetPassword(3, 'newpwd1234');
        expect(result.success).toBe(true);
        expect(runCalled).toBe(1);
    });

    it('getAllAdminUsers: 解析 permissions JSON 字符串', () => {
        handlers.push({
            match: (sql) => sql.includes('SELECT id, username, role'),
            all: () => [
                { id: 1, username: 'a', role: 'admin', alias: 'A', permissions: '["x","y"]', is_active: 1, created_at: '', updated_at: null, password_changed_at: null },
                { id: 2, username: 'b', role: 'editor', alias: 'B', permissions: null, is_active: 1, created_at: '', updated_at: null, password_changed_at: null },
                { id: 3, username: 'c', role: 'viewer', alias: 'C', permissions: 'not-json', is_active: 0, created_at: '', updated_at: null, password_changed_at: null },
            ],
        });
        const list = AdminUserService.getAllAdminUsers();
        expect(list).toHaveLength(3);
        expect(list[0].permissions).toEqual(['x', 'y']);
        expect(list[1].permissions).toEqual([]);
        expect(list[2].permissions).toEqual([]);
    });
});
