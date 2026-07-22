import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit 配置 — 仅用于生成新迁移(npx drizzle-kit generate)。
 *
 * 重要:实际生产环境表由 api/db.ts:initDB() 启动时创建(幂等),
 * 不应让 drizzle-kit 直接 push 到数据库,以免覆盖既有数据。
 *
 * Sprint 3 阶段 schema 仅作"事实表"使用;真正生成迁移前请:
 *   1. 跑 `npx drizzle-kit generate` 生成 SQL 文件
 *   2. 手工对比生成的 SQL 与 initDB() 现有 schema
 *   3. 把 SQL 合并到 initDB() 中(本 Sprint 不做)
 */
export default defineConfig({
    dialect: 'sqlite',
    driver: 'better-sqlite',
    schema: './api/db/schema.ts',
    out: './api/db/migrations',
    dbCredentials: {
        url: './data/app.db',
    },
    verbose: true,
    strict: true,
});
