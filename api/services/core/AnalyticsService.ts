/**
 * 文件功能：数据分析 Service 层，封装 analytics 路由的所有数据库查询操作
 * 主要类/函数：AnalyticsService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';
import { AccountService } from './AccountService.js';

/**
 * 摘要统计返回结构
 */
export interface SummaryStats {
    account_name: string;
    total_notes: number;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_collects: number;
    total_shares: number;
    last_sync_at?: string | null;
    needs_sync: boolean;
}

/**
 * 互动分析返回结构
 */
export interface EngagementStats {
    intents: { PRAISE: number; COMPLAINT: number; INQUIRY: number; OTHER: number };
    replyStats: { total: number; replied: number; rate: number };
    dailyTrend: { date: string; count: number }[];
}

/**
 * 导出数据返回结构（Excel 生成在路由层处理）
 */
export interface ExportData {
    account: { id: number; nickname: string };
    notes: any[];
}

export class AnalyticsService {
    /**
     * 功能描述：获取当前活跃账号的数据摘要统计
     *
     * 返回说明：
     * - SummaryStats 包含账号名、笔记数、阅读/点赞/评论/收藏总数
     *
     * 使用示例：
     * >>> const summary = AnalyticsService.getSummary();
     * >>> console.log(summary.total_views);
     *
     * 异常情况：
     * - 数据库查询异常会向上抛出，由路由层捕获处理
     */
    static getSummary(): SummaryStats {
        // 复用 AccountService 获取活跃账号信息（避免重复查询逻辑）
        const activeAccount = AccountService.getActiveAccount();

        // 无活跃账号时返回零值摘要
        if (!activeAccount) {
            return {
                account_name: 'No Active Account',
                total_notes: 0,
                total_views: 0,
                total_likes: 0,
                total_comments: 0,
                total_collects: 0,
                total_shares: 0,
                last_sync_at: null,
                needs_sync: true
            };
        }

        // 先判断该账号是否有正常写入的 note_stats 记录
        // 如果没有，尝试把 account_id 为 NULL 的历史脏数据也纳入统计，
        // 避免旧数据因为账号 ID 缺失导致分析面板全部显示为 0。
        const activeRowsCount = (db.prepare('SELECT COUNT(*) as count FROM note_stats WHERE account_id = ?')
            .get(activeAccount.id) as { count: number }).count;
        const accountFilter = activeRowsCount > 0 ? 'account_id = ?' : '(account_id = ? OR account_id IS NULL)';

        // 查询该账号的笔记总数
        const totalNotes = db.prepare(`SELECT COUNT(*) as count FROM note_stats WHERE ${accountFilter}`)
            .get(activeAccount.id) as { count: number };

        // 聚合查询阅读、点赞、收藏、分享总数（来自 note_stats 笔记维度快照）
        const sums = db.prepare(`
            SELECT
                SUM(views) as total_views,
                SUM(likes) as total_likes,
                SUM(collects) as total_collects,
                SUM(shares) as total_shares
            FROM note_stats
            WHERE ${accountFilter}
        `).get(activeAccount.id) as any;

        // 总评论数从 comments 表统计（实际收到的评论），而不是 note_stats.comments。
        // 原因：创作者中心 API 的 comments_count 经常为 0 或不准确，
        // 而 comments 表由同步评论任务写入，更能反映真实互动量。
        const commentCountRow = db.prepare(`
            SELECT COUNT(*) as count
            FROM comments
            WHERE account_id = ?
        `).get(activeAccount.id) as { count: number };

        // 查询最近一次同步时间，用于前端展示数据新鲜度
        const lastSyncRow = db.prepare(`
            SELECT MAX(record_date) as last_sync_at
            FROM note_stats
            WHERE ${accountFilter}
        `).get(activeAccount.id) as { last_sync_at: string | null } | undefined;

        const lastSyncAt = lastSyncRow?.last_sync_at || null;
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

        return {
            account_name: activeAccount.nickname,
            total_notes: totalNotes.count,
            total_views: sums.total_views || 0,
            total_likes: sums.total_likes || 0,
            total_comments: commentCountRow.count || 0,
            total_collects: sums.total_collects || 0,
            total_shares: sums.total_shares || 0,
            last_sync_at: lastSyncAt,
            needs_sync: !lastSyncAt || new Date(lastSyncAt).getTime() < sixHoursAgo.getTime()
        };
    }

    /**
     * 功能描述：获取当前活跃账号的笔记列表（分页）
     *
     * 参数说明：
     * - page: [number] 页码，从 1 开始 [1]
     * - pageSize: [number] 每页条数 [10]
     *
     * 返回说明：
     * - { data: any[], total: number, page: number, pageSize: number } 分页结果
     *
     * 使用示例：
     * >>> const result = AnalyticsService.getNotes(1, 20);
     * >>> console.log(result.data.length);
     */
    static getNotes(page: number, pageSize: number): { data: any[]; total: number; page: number; pageSize: number } {
        const accountId = AccountService.getActiveAccountId();

        // 无活跃账号时返回空分页
        if (!accountId) {
            return { data: [], total: 0, page, pageSize };
        }

        const offset = (page - 1) * pageSize;

        // Closed-loop JOIN: use note_stats.draft_id (written by PublishHandler on success)
        // to pull draft metadata. Falls back to note_stats.* when draft is missing,
        // so legacy rows without a draft_id still show up.
        const notes = db.prepare(`
            SELECT
                ns.*,
                d.title AS draft_title,
                d.tags AS draft_tags,
                d.content_type AS draft_content_type,
                d.meta_data AS draft_meta
            FROM note_stats ns
            LEFT JOIN drafts d ON d.id = ns.draft_id
            WHERE ns.account_id = ?
            ORDER BY ns.record_date DESC
            LIMIT ? OFFSET ?
        `).all(accountId, pageSize, offset);

        // 查询总数用于分页元信息
        const countResult = db.prepare('SELECT COUNT(*) as count FROM note_stats WHERE account_id = ?')
            .get(accountId) as { count: number };

        return {
            data: notes,
            total: countResult.count,
            page,
            pageSize
        };
    }

    /**
     * 功能描述：获取当前活跃账号近 30 天的历史趋势数据
     *
     * 返回说明：
     * - any[] 按日期聚合的每日数据（阅读、点赞、评论、收藏、互动量）
     *
     * 使用示例：
     * >>> const history = AnalyticsService.getHistory();
     * >>> console.log(history.length);
     *
     * NOTE: 使用 CTE + ROW_NUMBER 窗口函数取每篇笔记每天的最新快照，再按日聚合
     */
    static getHistory(): any[] {
        const accountId = AccountService.getActiveAccountId();
        if (!accountId) return [];

        // CTE 取每篇笔记每天的最新快照，避免重复计数
        const history = db.prepare(`
            WITH DailyLatest AS (
                SELECT
                    note_id,
                    views,
                    likes,
                    comments,
                    collects,
                    date(record_time) as record_date,
                    ROW_NUMBER() OVER (PARTITION BY note_id, date(record_time) ORDER BY record_time DESC) as rn
                FROM note_stats_history
                WHERE record_time > datetime('now', '-30 days')
            )
            SELECT
                DailyLatest.record_date as date,
                SUM(DailyLatest.views) as views,
                SUM(DailyLatest.likes) as likes,
                SUM(DailyLatest.comments) as comments,
                SUM(DailyLatest.collects) as collects,
                (SUM(DailyLatest.likes) + SUM(DailyLatest.comments) + SUM(DailyLatest.collects)) as interaction
            FROM DailyLatest
            JOIN note_stats n ON DailyLatest.note_id = n.note_id
            WHERE DailyLatest.rn = 1
            AND n.account_id = ?
            GROUP BY DailyLatest.record_date
            ORDER BY DailyLatest.record_date ASC
        `).all(accountId);

        return history;
    }

    /**
     * 功能描述：获取当前活跃账号的互动分析（意图分布、回复率、每日评论趋势）
     *
     * 返回说明：
     * - EngagementStats 包含 intents、replyStats、dailyTrend 三部分
     *
     * 使用示例：
     * >>> const engagement = AnalyticsService.getEngagement();
     * >>> console.log(engagement.replyStats.rate);
     */
    static getEngagement(): EngagementStats {
        const accountId = AccountService.getActiveAccountId();

        // 无活跃账号时返回零值结构
        if (!accountId) {
            return {
                intents: { PRAISE: 0, COMPLAINT: 0, INQUIRY: 0, OTHER: 0 },
                replyStats: { total: 0, replied: 0, rate: 0 },
                dailyTrend: []
            };
        }

        // 1. 意图分布统计
        const intents = db.prepare(`
            SELECT intent, COUNT(*) as count
            FROM comments
            WHERE account_id = ? AND intent IS NOT NULL
            GROUP BY intent
        `).all(accountId) as { intent: string, count: number }[];

        const intentMap = {
            PRAISE: 0,
            COMPLAINT: 0,
            INQUIRY: 0,
            OTHER: 0
        };
        intents.forEach(i => {
            if (i.intent in intentMap) {
                intentMap[i.intent as keyof typeof intentMap] = i.count;
            }
        });

        // 2. 回复率统计
        const replyStats = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN reply_status = 'REPLIED' THEN 1 ELSE 0 END) as replied
            FROM comments
            WHERE account_id = ?
        `).get(accountId) as { total: number, replied: number };

        // 3. 近 7 天每日评论趋势
        const dailyComments = db.prepare(`
            SELECT strftime('%Y-%m-%d', create_time) as date, COUNT(*) as count
            FROM comments
            WHERE account_id = ? AND create_time > datetime('now', '-7 days')
            GROUP BY date
            ORDER BY date ASC
        `).all(accountId) as { date: string, count: number }[];

        return {
            intents: intentMap,
            replyStats: {
                total: replyStats.total,
                replied: replyStats.replied,
                rate: replyStats.total > 0 ? Math.round((replyStats.replied / replyStats.total) * 100) : 0
            },
            dailyTrend: dailyComments
        };
    }

    /**
     * 功能描述：获取当前活跃账号的导出数据（笔记列表，Excel 生成在路由层处理）
     *
     * 返回说明：
     * - ExportData | null 包含账号信息和笔记数据，无活跃账号或无数据时返回 null
     *
     * 使用示例：
     * >>> const data = AnalyticsService.getExportData();
     * >>> if (!data) return res.status(404).json({ error: 'No data' });
     *
     * NOTE: 字段名使用中文别名，便于直接导出为 Excel 表头
     */
    static getExportData(): ExportData | null {
        const activeAccount = AccountService.getActiveAccount();
        if (!activeAccount) return null;

        // 查询笔记数据并使用中文别名（直接作为 Excel 列头）
        const notes = db.prepare(`
            SELECT
                title as '笔记标题',
                views as '阅读量',
                likes as '点赞数',
                collects as '收藏数',
                comments as '评论数',
                publish_date as '发布时间',
                record_date as '最后更新时间'
            FROM note_stats
            WHERE account_id = ?
            ORDER BY publish_date DESC
        `).all(activeAccount.id);

        return {
            account: activeAccount,
            notes
        };
    }
}
