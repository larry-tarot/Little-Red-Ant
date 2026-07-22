/**
 * Drizzle 客户端 — 供新代码(niche、prompt_optimizer 等)使用。
 *
 * 与 api/db.ts 并存:
 *   - api/db.ts:导出 better-sqlite3 `db` 实例 + initDB() 启动钩子,所有旧代码继续用
 *   - api/db/client.ts(本文件):导出 `ormDb` (Drizzle 实例),仅供新代码 import
 *
 * 共享策略:动态 import api/db.js(其顶层代码会创建 :memory: 或文件 db),
 * 然后用 Drizzle 包装同一个 `db` 实例,确保两个客户端看到同一份数据。
 *
 * Test mode 行为:
 *   - api/db.ts 检查 process.env.LITTLE_RED_ANT_TEST=1 → 用 :memory: + auto initDB
 *   - 任何导入 api/db/client.ts 的模块都通过 ormDb 访问同一份数据
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

/**
 * Lazily-resolved Drizzle instance backed by api/db.ts's singleton.
 * We resolve on first call; subsequent callers reuse the same instance.
 */
let _ormDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _initPromise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null = null;

export async function getOrmDb() {
    if (_ormDb) return _ormDb;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        const mod = await import('../db.js');
        const sqliteHandle = mod.default;
        const instance = drizzle(sqliteHandle, { schema });
        _ormDb = instance;
        _syncOrmDb = instance;
        return instance;
    })();
    return _initPromise;
}

/**
 * Synchronous accessor — valid AFTER getOrmDb() has been called at least once.
 * Throws otherwise to surface init-order bugs early.
 */
let _syncOrmDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
export function getOrmDbSync() {
    if (_syncOrmDb) return _syncOrmDb;
    throw new Error('getOrmDbSync() called before getOrmDb() — call await getOrmDb() in beforeEach first.');
}

/**
 * `ormDb` proxy — lazily resolves via getOrmDb() on first call.
 * For purely sync code, prefer getOrmDbSync() after a priming call.
 */
export const ormDb = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get(_target, prop) {
        if (!_syncOrmDb) {
            // Attempt auto-init: if we're in test mode the db is already live,
            // in production the server boot process will have initialized it.
            // If still null, the proxy throws a clear error rather than a cryptic
            // "cannot read of undefined" later.
            getOrmDb().catch(() => {
                // swallow — the real error will surface when the caller tries to
                // await the first query on the returned promise-like object.
            });
        }
        if (!_syncOrmDb) {
            throw new Error(`ormDb.${String(prop)} used before initialization. Call await getOrmDb() first.`);
        }
        const value = (_syncOrmDb as any)[prop];
        return typeof value === 'function' ? value.bind(_syncOrmDb) : value;
    },
});

// Re-export schema for convenient access in queries.
export { schema };

// Re-export table types for use in handlers.
// Usage: import type { Account, TrendingNote } from '../db/client.js';
export type Account = typeof schema.accounts.$inferSelect;
export type NewAccount = typeof schema.accounts.$inferInsert;
export type Draft = typeof schema.drafts.$inferSelect;
export type Task = typeof schema.tasks.$inferSelect;
export type TrendingNote = typeof schema.trendingNotes.$inferSelect;
export type NewTrendingNote = typeof schema.trendingNotes.$inferInsert;
export type Comment = typeof schema.comments.$inferSelect;
export type Notification = typeof schema.notifications.$inferSelect;
export type PromptTemplate = typeof schema.promptTemplates.$inferSelect;
export type VideoProject = typeof schema.videoProjects.$inferSelect;
export type VideoScene = typeof schema.videoScenes.$inferSelect;
export type RpaSelector = typeof schema.rpaSelectors.$inferSelect;
