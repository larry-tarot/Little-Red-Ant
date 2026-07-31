/**
 * Drizzle 仓储层 —— 新代码的标准查询入口。
 *
 * 设计原则:不要在 Route/Handler 里直接拼 SQL;统一来这里。
 * 与 api/services/core/* 不同的是,这里只关心"读"和"简单的写"，
 * 不涉及业务规则。
 *
 * Sprint 3+8: 引入 Drizzle ORM 双轨迁移。
 * 第 1 批迁移:accounts、tasks、drafts(最常用的 3 个表)。
 * 剩余 20+ 个表逐步迁移,本文件只做新表首批示范。
 */

import { getOrmDb } from './client.js';
import { and, desc, eq, sql, like, isNotNull, asc } from 'drizzle-orm';
import * as schema from './schema.js';

// ──────────────────────────────────────────────
// Accounts Repository
// ──────────────────────────────────────────────
export class AccountRepository {
    /** 获取活跃账号列表 */
    static async getActiveAccounts() {
        const db = await getOrmDb();
        return db.select().from(schema.accounts).where(eq(schema.accounts.isActive, true));
    }

    /** 根据 ID 获取账号 */
    static async getById(id: number) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).limit(1);
        return result[0] || null;
    }

    /** 获取所有账号(不含 cookie 字段) */
    static async getAll() {
        const db = await getOrmDb();
        return db
            .select({
                id: schema.accounts.id,
                nickname: schema.accounts.nickname,
                alias: schema.accounts.alias,
                avatar: schema.accounts.avatar,
                isActive: schema.accounts.isActive,
                status: schema.accounts.status,
                personaDesc: schema.accounts.personaDesc,
                tone: schema.accounts.tone,
                niche: schema.accounts.niche,
                lastUsedAt: schema.accounts.lastUsedAt,
                createdAt: schema.accounts.createdAt,
            })
            .from(schema.accounts)
            .orderBy(desc(schema.accounts.createdAt));
    }

    /** 设置活跃账号 */
    static async setActive(id: number) {
        const db = await getOrmDb();
        // 先清除所有活跃标记
        await db.update(schema.accounts).set({ isActive: false }).run();
        // 再设置目标账号
        await db.update(schema.accounts).set({ isActive: true }).where(eq(schema.accounts.id, id)).run();
    }
}

// ──────────────────────────────────────────────
// Tasks Repository
// ──────────────────────────────────────────────
export class TaskRepository {
    /** 获取活跃任务(PROCESSING + PENDING) */
    static async getActiveTasks() {
        const db = await getOrmDb();
        return db
            .select()
            .from(schema.tasks)
            .where(sql`${schema.tasks.status} IN ('PROCESSING', 'PENDING')`)
            .orderBy(desc(schema.tasks.priority), asc(schema.tasks.createdAt));
    }

    /** 分页查询任务列表 */
    static async list(page: number, pageSize: number, status?: string) {
        const db = await getOrmDb();
        const offset = (page - 1) * pageSize;
        const conditions = status ? eq(schema.tasks.status, status as any) : undefined;

        const [data, countResult] = await Promise.all([
            db
                .select()
                .from(schema.tasks)
                .where(conditions)
                .orderBy(desc(schema.tasks.createdAt))
                .limit(pageSize)
                .offset(offset),
            db
                .select({ count: sql<number>`count(*)`.as('count') })
                .from(schema.tasks)
                .where(conditions),
        ]);

        return {
            data,
            total: Number(countResult[0]?.count ?? 0),
            page,
            pageSize,
            totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / pageSize),
        };
    }

    /** 获取任务统计 */
    static async getStats() {
        const db = await getOrmDb();
        const rows = await db
            .select({
                status: schema.tasks.status,
                count: sql<number>`count(*)`.as('count'),
            })
            .from(schema.tasks)
            .groupBy(schema.tasks.status);
        return {
            pending: rows.find(r => r.status === 'PENDING')?.count ?? 0,
            processing: rows.find(r => r.status === 'PROCESSING')?.count ?? 0,
            completed: rows.find(r => r.status === 'COMPLETED')?.count ?? 0,
            failed: rows.find(r => r.status === 'FAILED')?.count ?? 0,
        };
    }
}

// ──────────────────────────────────────────────
// Drafts Repository
// ──────────────────────────────────────────────
export class DraftRepository {
    /** 获取所有草稿(按更新时间倒序) */
    static async getAll() {
        const db = await getOrmDb();
        return db
            .select()
            .from(schema.drafts)
            .orderBy(desc(schema.drafts.updatedAt));
    }

    /** 根据 ID 获取草稿 */
    static async getById(id: number) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.drafts).where(eq(schema.drafts.id, id)).limit(1);
        return result[0] || null;
    }

    /** 创建草稿 */
    static async create(data: {
        title: string;
        content: string;
        tags?: string;
        images?: string;
        contentType?: string;
        metaData?: string;
    }) {
        const db = await getOrmDb();
        const result = await db
            .insert(schema.drafts)
            .values({
                title: data.title,
                content: data.content,
                tags: data.tags,
                images: data.images,
                contentType: data.contentType || 'note',
                metaData: data.metaData,
            })
            .returning();
        return result[0];
    }
}

// ──────────────────────────────────────────────
// Niche Repository (原有)
// ──────────────────────────────────────────────
export class NicheRepository {
    static async getKeywordStats(): Promise<{ keyword: string; count: number }[]> {
        const db = await getOrmDb();
        const rows = await db
            .select({
                keyword: schema.trendingNotes.searchKeyword,
                count: sql<number>`count(*)`.as('count'),
            })
            .from(schema.trendingNotes)
            .where(isNotNull(schema.trendingNotes.searchKeyword))
            .groupBy(schema.trendingNotes.searchKeyword)
            .orderBy(desc(sql`count`));
        return rows.map((r) => ({ keyword: r.keyword ?? '(无关键词)', count: Number(r.count) }));
    }

    static async searchNotes(params: {
        keyword?: string; sort?: 'likes' | 'collects' | 'comments' | 'date';
        page: number; pageSize: number; hasAnalysis?: boolean; topic?: string;
    }): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
        const { keyword, sort = 'likes', page, pageSize, hasAnalysis, topic } = params;
        const offset = (page - 1) * pageSize;
        const db = await getOrmDb();
        const conditions = [isNotNull(schema.trendingNotes.searchKeyword)];
        if (keyword) conditions.push(eq(schema.trendingNotes.searchKeyword, keyword.trim()));
        if (hasAnalysis) conditions.push(isNotNull(schema.trendingNotes.analysisResult));
        if (topic) conditions.push(like(schema.trendingNotes.topicTags, `%"${topic}"%`));
        const where = and(...conditions);
        const sortColumns = { likes: schema.trendingNotes.likesCount, collects: schema.trendingNotes.collectsCount, comments: schema.trendingNotes.commentsCount, date: schema.trendingNotes.scrapedAt } as const;
        const orderCol = sortColumns[sort] ?? sortColumns.likes;
        const [data, countResult] = await Promise.all([
            db.select().from(schema.trendingNotes).where(where).orderBy(desc(orderCol)).limit(pageSize).offset(offset),
            db.select({ count: sql<number>`count(*)`.as('count') }).from(schema.trendingNotes).where(where),
        ]);
        return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
    }

    static async listRecentVideos(limit: number = 20) {
        const db = await getOrmDb();
        return db.select().from(schema.trendingNotes).where(eq(schema.trendingNotes.type, 'video')).orderBy(desc(schema.trendingNotes.scrapedAt)).limit(limit);
    }
}

// ──────────────────────────────────────────────
// Comments Repository
// ──────────────────────────────────────────────
export class CommentRepository {
    /** 分页查询评论 */
    static async list(params: { status?: string; page: number; pageSize: number; accountId?: number }) {
        const db = await getOrmDb();
        const offset = (params.page - 1) * params.pageSize;
        const conditions = [];
        if (params.status) conditions.push(eq(schema.comments.replyStatus, params.status as any));
        if (params.accountId) conditions.push(eq(schema.comments.accountId, params.accountId));
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [data, countResult] = await Promise.all([
            db.select().from(schema.comments).where(where).orderBy(desc(schema.comments.createTime)).limit(params.pageSize).offset(offset),
            db.select({ count: sql<number>`count(*)`.as('count') }).from(schema.comments).where(where),
        ]);
        return { data, total: Number(countResult[0]?.count ?? 0), page: params.page, pageSize: params.pageSize };
    }

    static async getById(id: string) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.comments).where(eq(schema.comments.id, id)).limit(1);
        return result[0] || null;
    }

    static async updateAnalysis(id: string, intent: string, suggestion: string) {
        const db = await getOrmDb();
        await db.update(schema.comments).set({ intent: intent as any, aiReplySuggestion: suggestion }).where(eq(schema.comments.id, id)).run();
    }
}

// ──────────────────────────────────────────────
// Note Stats Repository
// ──────────────────────────────────────────────
export class NoteStatsRepository {
    /** 获取账号概览统计 */
    static async getSummary(accountId: number) {
        const db = await getOrmDb();
        const [totalNotes, sums] = await Promise.all([
            db.select({ count: sql<number>`count(*)`.as('count') }).from(schema.noteStats).where(eq(schema.noteStats.accountId, accountId)),
            db.select({
                views: sql<number>`coalesce(sum(views), 0)`.as('views'),
                likes: sql<number>`coalesce(sum(likes), 0)`.as('likes'),
                comments: sql<number>`coalesce(sum(comments), 0)`.as('comments'),
                collects: sql<number>`coalesce(sum(collects), 0)`.as('collects'),
            }).from(schema.noteStats).where(eq(schema.noteStats.accountId, accountId)),
        ]);
        return { totalNotes: Number(totalNotes[0]?.count ?? 0), ...sums[0] };
    }

    /** 分页查询笔记数据 */
    static async list(accountId: number, page: number, pageSize: number) {
        const db = await getOrmDb();
        const offset = (page - 1) * pageSize;
        const [data, countResult] = await Promise.all([
            db.select().from(schema.noteStats).where(eq(schema.noteStats.accountId, accountId)).orderBy(desc(schema.noteStats.recordDate)).limit(pageSize).offset(offset),
            db.select({ count: sql<number>`count(*)`.as('count') }).from(schema.noteStats).where(eq(schema.noteStats.accountId, accountId)),
        ]);
        return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
    }
}

// ──────────────────────────────────────────────
// Video Projects Repository
// ──────────────────────────────────────────────
export class VideoProjectRepository {
    static async getById(id: string) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.videoProjects).where(eq(schema.videoProjects.id, id)).limit(1);
        return result[0] || null;
    }

    static async list() {
        const db = await getOrmDb();
        return db.select().from(schema.videoProjects).orderBy(desc(schema.videoProjects.createdAt));
    }

    static async create(data: { id: string; title: string; scriptContent: string; status?: string; characterDesc?: string; tags?: string; description?: string; createdBy?: number }) {
        const db = await getOrmDb();
        await db.insert(schema.videoProjects).values({
            id: data.id, title: data.title, scriptContent: data.scriptContent,
            status: (data.status || 'DRAFT') as any, characterDesc: data.characterDesc,
            tags: data.tags, description: data.description, createdBy: data.createdBy,
        }).run();
    }

    static async update(id: string, data: Partial<{ status: string; finalVideoUrl: string; bgmUrl: string; characterDesc: string; noteId: string; publishStatus: string }>) {
        const db = await getOrmDb();
        await db.update(schema.videoProjects).set(data as any).where(eq(schema.videoProjects.id, id)).run();
    }

    static async delete(id: string) {
        const db = await getOrmDb();
        await db.delete(schema.videoProjects).where(eq(schema.videoProjects.id, id)).run();
    }
}

// ──────────────────────────────────────────────
// Settings Repository
// ──────────────────────────────────────────────
export class SettingsRepository {
    static async getAll(): Promise<Record<string, string>> {
        const db = await getOrmDb();
        const rows = await db.select().from(schema.settings);
        const result: Record<string, string> = {};
        rows.forEach(r => { if (r.key) result[r.key] = r.value ?? ''; });
        return result;
    }

    static async get(key: string): Promise<string | null> {
        const db = await getOrmDb();
        const result = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
        return result[0]?.value ?? null;
    }

    static async set(key: string, value: string, description?: string) {
        const db = await getOrmDb();
        const existing = await db.select({ key: schema.settings.key }).from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
        if (existing.length > 0) {
            await db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key)).run();
        } else {
            await db.insert(schema.settings).values({ key, value, description: description ?? '' }).run();
        }
    }
}

// ──────────────────────────────────────────────
// Notifications Repository
// ──────────────────────────────────────────────
export class NotificationRepository {
    static async list(limit: number = 20) {
        const db = await getOrmDb();
        return db.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)).limit(limit);
    }

    static async getUnreadCount() {
        const db = await getOrmDb();
        const result = await db.select({ count: sql<number>`count(*)`.as('count') }).from(schema.notifications).where(eq(schema.notifications.isRead, false as any));
        return Number(result[0]?.count ?? 0);
    }

    static async markAsRead(id: number) {
        const db = await getOrmDb();
        await db.update(schema.notifications).set({ isRead: true as any }).where(eq(schema.notifications.id, id)).run();
    }

    static async markAllAsRead() {
        const db = await getOrmDb();
        await db.update(schema.notifications).set({ isRead: true as any }).run();
    }
}

// ──────────────────────────────────────────────
// Competitors Repository
// ──────────────────────────────────────────────
export class CompetitorRepository {
    static async list() {
        const db = await getOrmDb();
        return db.select().from(schema.competitors).orderBy(desc(schema.competitors.lastUpdated));
    }

    static async getById(id: number) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.competitors).where(eq(schema.competitors.id, id)).limit(1);
        return result[0] || null;
    }

    static async getNotes(competitorId: number) {
        const db = await getOrmDb();
        return db.select().from(schema.competitorNotes).where(eq(schema.competitorNotes.competitorId, competitorId)).orderBy(desc(schema.competitorNotes.likes));
    }
}

// ──────────────────────────────────────────────
// Trends Repository
// ──────────────────────────────────────────────
export class TrendRepository {
    static async getBySource(source: string) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.trends).where(eq(schema.trends.source, source)).limit(1);
        return result[0] || null;
    }

    static async upsert(source: string, data: string) {
        const db = await getOrmDb();
        const existing = await db.select({ source: schema.trends.source }).from(schema.trends).where(eq(schema.trends.source, source)).limit(1);
        if (existing.length > 0) {
            await db.update(schema.trends).set({ data }).where(eq(schema.trends.source, source)).run();
        } else {
            await db.insert(schema.trends).values({ source, data }).run();
        }
    }
}

// ──────────────────────────────────────────────
// Compliance Rules Repository
// ──────────────────────────────────────────────
export class ComplianceRuleRepository {
    static async getEnabled() {
        const db = await getOrmDb();
        return db.select().from(schema.complianceRules).where(eq(schema.complianceRules.isEnabled, true as any));
    }
}

// ──────────────────────────────────────────────
// Admin Users Repository
// ──────────────────────────────────────────────
export class AdminUserRepository {
    static async findByUsername(username: string) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.username, username)).limit(1);
        return result[0] || null;
    }

    static async list() {
        const db = await getOrmDb();
        return db.select({ id: schema.adminUsers.id, username: schema.adminUsers.username, alias: schema.adminUsers.alias, role: schema.adminUsers.role }).from(schema.adminUsers);
    }
}

// ──────────────────────────────────────────────
// Users (Persona) Repository
// ──────────────────────────────────────────────
export class PersonaRepository {
    static async getActive() {
        const db = await getOrmDb();
        const result = await db.select().from(schema.users).where(eq(schema.users.isActive, true as any)).limit(1);
        return result[0] || null;
    }

    static async list() {
        const db = await getOrmDb();
        return db.select().from(schema.users).orderBy(desc(schema.users.updatedAt));
    }
}

// ──────────────────────────────────────────────
// Prompt Templates Repository
// ──────────────────────────────────────────────
export class PromptTemplateRepository {
    static async getDefaults() {
        const db = await getOrmDb();
        return db.select().from(schema.promptTemplates).where(eq(schema.promptTemplates.isDefault, true as any));
    }

    static async getByName(name: string) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.promptTemplates).where(eq(schema.promptTemplates.name, name)).limit(1);
        return result[0] || null;
    }
}

// ──────────────────────────────────────────────
// Assets Repository
// ──────────────────────────────────────────────
export class AssetRepository {
    static async list(type?: string) {
        const db = await getOrmDb();
        if (type) return db.select().from(schema.assets).where(eq(schema.assets.type, type)).orderBy(desc(schema.assets.createdAt));
        return db.select().from(schema.assets).orderBy(desc(schema.assets.createdAt));
    }

    static async getById(id: string) {
        const db = await getOrmDb();
        const result = await db.select().from(schema.assets).where(eq(schema.assets.id, id)).limit(1);
        return result[0] || null;
    }
}

// ──────────────────────────────────────────────
// RPA Selectors Repository
// ──────────────────────────────────────────────
export class RpaSelectorRepository {
    static async getByPlatform(platform: string) {
        const db = await getOrmDb();
        return db.select().from(schema.rpaSelectors).where(eq(schema.rpaSelectors.platform, platform));
    }
}

// ──────────────────────────────────────────────
// Note Stats History Repository
// ──────────────────────────────────────────────
export class NoteStatsHistoryRepository {
    static async getByNoteId(noteId: string) {
        const db = await getOrmDb();
        return db.select().from(schema.noteStatsHistory).where(eq(schema.noteStatsHistory.noteId, noteId)).orderBy(desc(schema.noteStatsHistory.recordTime));
    }
}

// ──────────────────────────────────────────────
// Competitor Stats History Repository
// ──────────────────────────────────────────────
export class CompetitorStatsHistoryRepository {
    static async getByCompetitorId(competitorId: number) {
        const db = await getOrmDb();
        return db.select().from(schema.competitorStatsHistory).where(eq(schema.competitorStatsHistory.competitorId, competitorId)).orderBy(desc(schema.competitorStatsHistory.recordDate));
    }
}

// ──────────────────────────────────────────────
// Prompt Optimizations Repository
// ──────────────────────────────────────────────
export class PromptOptimizationRepository {
    static async list() {
        const db = await getOrmDb();
        return db.select().from(schema.promptOptimizations).orderBy(desc(schema.promptOptimizations.createdAt));
    }
}

// ──────────────────────────────────────────────
// Video Scenes Repository
// ──────────────────────────────────────────────
export class VideoSceneRepository {
    static async getByProjectId(projectId: string) {
        const db = await getOrmDb();
        return db.select().from(schema.videoScenes).where(eq(schema.videoScenes.projectId, projectId)).orderBy(asc(schema.videoScenes.sceneIndex));
    }
}

