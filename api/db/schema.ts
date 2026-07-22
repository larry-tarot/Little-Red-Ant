/**
 * Drizzle Schema — 双轨迁移期用。
 *
 * 设计目标:让新代码(niche、prompt_optimizer)用 Drizzle 写;旧代码继续用
 * 裸 SQL via better-sqlite3(由 api/db.ts 导出),无需任何改动。
 *
 * 重要:本 schema 必须与 api/db.ts:initDB() 创建的表结构保持一致,否则
 * Drizzle 生成的迁移会与现有表冲突。Schema 在此仅作"事实表"。
 */

import { sqliteTable, integer, text, real, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- Core Identity & Auth ---
export const adminUsers = sqliteTable('admin_users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').default('admin'),
    alias: text('alias'),
    permissions: text('permissions'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').default('默认人设'),
    niche: text('niche'),
    identityTags: text('identity_tags'),
    style: text('style'),
    benchmarkAccounts: text('benchmark_accounts'),
    writingSamples: text('writing_samples'),
    isActive: integer('is_active', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Account Matrix ---
export const accounts = sqliteTable('accounts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nickname: text('nickname'),
    alias: text('alias'),
    userId: text('user_id'),
    avatar: text('avatar'),
    status: text('status').default('UNKNOWN'),
    isActive: integer('is_active', { mode: 'boolean' }).default(false),
    cookies: text('cookies'),
    creatorCookies: text('creator_cookies'),
    mainSiteCookies: text('main_site_cookies'),
    profilePath: text('profile_path'),
    personaImageUrl: text('persona_image_url'),
    personaDesc: text('persona_desc'),
    tone: text('tone'),
    writingSample: text('writing_sample'),
    niche: text('niche'),
    lastUsedAt: text('last_used_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Content & Drafts ---
export const drafts = sqliteTable('drafts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title'),
    content: text('content'),
    tags: text('tags'),
    images: text('images'),
    contentType: text('content_type').default('note'),
    metaData: text('meta_data'),
    publishedNoteId: text('published_note_id'),
    publishedUrl: text('published_url'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Async Task Queue ---
export const tasks = sqliteTable('tasks', {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull().default('PENDING'),
    payload: text('payload'),
    result: text('result'),
    error: text('error'),
    attempts: integer('attempts').default(0),
    progress: integer('progress').default(0),
    scheduledAt: text('scheduled_at'),
    priority: integer('priority').default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    statusIdx: index('idx_tasks_status').on(table.status),
    scheduledIdx: index('idx_tasks_scheduled').on(table.scheduledAt),
}));

// --- Key-Value Settings ---
export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value'),
    description: text('description'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Hot Trends Cache ---
export const trends = sqliteTable('trends', {
    source: text('source').primaryKey(),
    data: text('data'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Trending Notes (Search & Topic Mining both write here) ---
export const trendingNotes = sqliteTable('trending_notes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    platform: text('platform').default('xiaohongshu'),
    noteId: text('note_id').unique(),
    title: text('title'),
    authorName: text('author_name'),
    authorAvatar: text('author_avatar'),
    coverUrl: text('cover_url'),
    noteUrl: text('note_url'),
    likesCount: integer('likes_count').default(0),
    commentsCount: integer('comments_count').default(0),
    collectsCount: integer('collects_count').default(0),
    content: text('content'),
    type: text('type'),
    tags: text('tags'),
    analysisResult: text('analysis_result'),
    transcript: text('transcript'),
    ocrContent: text('ocr_content'),
    videoMeta: text('video_meta'),
    category: text('category'),
    videoUrl: text('video_url'),
    images: text('images'),
    searchKeyword: text('search_keyword'),
    topicTags: text('topic_tags'),
    scrapedAt: text('scraped_at').default(sql`CURRENT_TIMESTAMP`),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    searchKwIdx: index('idx_trending_notes_search_kw').on(table.searchKeyword),
    topicTagIdx: index('idx_trending_notes_topic_tags').on(table.topicTags),
}));

// --- Comments ---
export const comments = sqliteTable('comments', {
    id: text('id').primaryKey(),
    noteId: text('note_id'),
    userId: text('user_id'),
    userNickname: text('user_nickname'),
    userAvatar: text('user_avatar'),
    content: text('content'),
    createTime: text('create_time'),
    likeCount: integer('like_count').default(0),
    subCommentCount: integer('sub_comment_count').default(0),
    parentId: text('parent_id'),
    replyStatus: text('reply_status').default('UNREAD'),
    accountId: integer('account_id'),
    intent: text('intent'),
    aiReplySuggestion: text('ai_reply_suggestion'),
    type: text('type').default('COMMENT'),
    rootNoteId: text('root_note_id'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Competitor Spy ---
export const competitors = sqliteTable('competitors', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').unique(),
    nickname: text('nickname'),
    avatar: text('avatar'),
    latestNotes: text('latest_notes'),
    analysisResult: text('analysis_result'),
    fansCount: integer('fans_count').default(0),
    notesCount: integer('notes_count').default(0),
    status: text('status').default('active'),
    lastError: text('last_error'),
    lastUpdated: text('last_updated'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const competitorNotes = sqliteTable('competitor_notes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    competitorId: integer('competitor_id').notNull(),
    noteId: text('note_id'),
    title: text('title'),
    cover: text('cover'),
    url: text('url'),
    likes: integer('likes').default(0),
    publishDate: text('publish_date'),
    scrapedAt: text('scraped_at').default(sql`CURRENT_TIMESTAMP`),
});

export const competitorStatsHistory = sqliteTable('competitor_stats_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    competitorId: integer('competitor_id').notNull(),
    fansCount: integer('fans_count').default(0),
    notesCount: integer('notes_count').default(0),
    likesCount: integer('likes_count').default(0),
    recordDate: text('record_date').default(sql`CURRENT_TIMESTAMP`),
});

// --- Notification & Optimizations ---
export const notifications = sqliteTable('notifications', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: integer('is_read', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const promptTemplates = sqliteTable('prompt_templates', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    description: text('description'),
    template: text('template').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).default(false),
    version: integer('version').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const promptOptimizations = sqliteTable('prompt_optimizations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    originalTemplateId: integer('original_template_id'),
    targetStyle: text('target_style'),
    analysisReport: text('analysis_report'),
    optimizedTemplate: text('optimized_template'),
    performanceMetrics: text('performance_metrics'),
    status: text('status').default('PENDING'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Note Statistics & History ---
export const noteStats = sqliteTable('note_stats', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    noteId: text('note_id'),
    title: text('title'),
    coverImage: text('cover_image'),
    views: integer('views').default(0),
    likes: integer('likes').default(0),
    comments: integer('comments').default(0),
    collects: integer('collects').default(0),
    shares: integer('shares').default(0),
    publishDate: text('publish_date'),
    xsecToken: text('xsec_token'),
    accountId: integer('account_id'),
    draftId: integer('draft_id'),
    recordDate: text('record_date').default(sql`CURRENT_TIMESTAMP`),
});

export const noteStatsHistory = sqliteTable('note_stats_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    noteId: text('note_id'),
    competitorId: integer('competitor_id'),
    views: integer('views').default(0),
    likes: integer('likes').default(0),
    comments: integer('comments').default(0),
    collects: integer('collects').default(0),
    shares: integer('shares').default(0),
    recordTime: text('record_time').default(sql`CURRENT_TIMESTAMP`),
});

// --- Assets ---
export const assets = sqliteTable('assets', {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    type: text('type').notNull(),
    filename: text('filename').notNull(),
    url: text('url').notNull(),
    size: integer('size'),
    mimeType: text('mime_type'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// --- Compliance ---
export const complianceRules = sqliteTable('compliance_rules', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    category: text('category').notNull(),
    keyword: text('keyword').notNull().unique(),
    level: text('level').notNull(),
    suggestion: text('suggestion'),
    isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at'),
});

// --- RPA Selectors ---
export const rpaSelectors = sqliteTable('rpa_selectors', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    platform: text('platform').default('xiaohongshu'),
    category: text('category').notNull(),
    key: text('key').notNull(),
    selector: text('selector').notNull(),
    description: text('description'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    uniq: index('uniq_rpa_selectors').on(table.platform, table.category, table.key),
}));

// --- Video Projects ---
export const videoProjects = sqliteTable('video_projects', {
    id: text('id').primaryKey(),
    title: text('title'),
    scriptContent: text('script_content'),
    status: text('status').default('DRAFT'),
    finalVideoUrl: text('final_video_url'),
    bgmUrl: text('bgm_url'),
    characterDesc: text('character_desc'),
    tags: text('tags'),
    description: text('description'),
    publishStatus: text('publish_status').default('UNPUBLISHED'),
    publishTaskId: text('publish_task_id'),
    noteId: text('note_id'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const videoScenes = sqliteTable('video_scenes', {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sceneIndex: integer('scene_index').notNull(),
    scriptVisual: text('script_visual'),
    scriptAudio: text('script_audio'),
    status: text('status').default('PENDING'),
    videoUrl: text('video_url'),
    audioUrl: text('audio_url'),
    duration: real('duration'),
    taskId: text('task_id'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});
