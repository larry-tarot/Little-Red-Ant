/**
 * 文件功能：今日工作台聚合 Service，整合多模块数据生成统一工作台视图
 * 主要类/函数：WorkbenchService
 * 设计思路：
 * - 聚合 P1/P2 阶段的核心资产与行动流 (Today Actions)
 * - 按账号维度严格隔离（accountId）
 * - 贯通主路径：待决策机会卡 -> 制作中内容包 -> 待人工核验发布包 -> 运营建议与异动
 */

import db from '../../db.js';
import { AccountService } from './AccountService.js';
import { AnalyticsService } from './AnalyticsService.js';

/**
 * 紧急事项结构
 */
export interface UrgentItem {
    type: 'reply_comments' | 'anomaly_note' | 'competitor_alert' | 'task_failed' | 'anomaly_burst' | 'opportunity_pending' | 'draft_review';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    action_link: string;
    count: number;
}

/**
 * 数据概要结构
 */
export interface SummaryData {
    date_range: { start: string; end: string };
    reads_change: number;
    likes_change: number;
    followers_change: number;
    comments_change: number;
    collects_change: number;
    top_note_title: string;
    top_note_metric: string;
}

/**
 * 日历预览结构
 */
export interface CalendarPreview {
    today_scheduled: number;
    this_week_remaining: number;
    next_deadline: string | null;
}

/**
 * 运营建议结构
 */
export interface Suggestion {
    type: 'competitor_learn' | 'content_gap' | 'best_posting_time' | 'unreplied_high' | 'opportunity_gap';
    title: string;
    description: string;
    action_link: string;
}

/**
 * 今日行动项（Today Actions 任务流）
 */
export interface TodayActions {
    pending_opportunities: Array<{
        id: string;
        title: string;
        targetAudience: string;
        problem: string;
        createdAt?: string;
    }>;
    in_progress_packages: Array<{
        id: string;
        title: string;
        currentVersion: number;
        updatedAt?: string;
    }>;
    ready_to_publish_count: number;
    active_radar_watches_count: number;
}

/**
 * 今日工作台完整响应结构
 */
export interface TodayWorkbench {
    urgent_tasks: UrgentItem[];
    today_actions: TodayActions;
    summary: SummaryData | null;
    calendar_preview: CalendarPreview;
    suggestions: Suggestion[];
    account_name: string;
}

export class WorkbenchService {
    /**
     * 聚合各模块数据，生成今日工作台视图（支持 accountId 账号隔离）
     */
    static getTodayWorkbench(accountId?: number): TodayWorkbench {
        let accountName = '未绑定账号';
        let resolvedAccountId = accountId;

        if (resolvedAccountId) {
            const acc = db.prepare('SELECT nickname FROM accounts WHERE id = ?').get(resolvedAccountId) as any;
            if (acc) {
                accountName = acc.nickname;
            }
        } else {
            const active = AccountService.getActiveAccount();
            if (active) {
                accountName = active.nickname;
                resolvedAccountId = active.id;
            }
        }

        // 1. 收集 Today Actions (核心业务主路径)
        const todayActions = this.collectTodayActions(resolvedAccountId);

        // 2. 收集紧急事项
        const urgentTasks = this.collectUrgentTasks(resolvedAccountId, todayActions);

        // 3. 计算数据概要
        const summary = this.calculateSummary();

        // 4. 日历预览
        const calendarPreview = this.getCalendarPreview();

        // 5. 运营建议
        const suggestions = this.generateSuggestions(resolvedAccountId, todayActions);

        return {
            urgent_tasks: urgentTasks,
            today_actions: todayActions,
            summary,
            calendar_preview: calendarPreview,
            suggestions,
            account_name: accountName,
        };
    }

    /**
     * 收集账号专属的核心行动流资产
     */
    private static collectTodayActions(accountId?: number): TodayActions {
        try {
            // 1. 待决策机会卡 (IDEA 状态)
            let pendingOpps: any[] = [];
            if (accountId) {
                pendingOpps = db.prepare(`
                    SELECT id, title, target_audience, problem, created_at
                    FROM content_opportunities
                    WHERE account_id = ? AND status = 'IDEA'
                    ORDER BY created_at DESC LIMIT 5
                `).all(accountId);
            } else {
                pendingOpps = db.prepare(`
                    SELECT id, title, target_audience, problem, created_at
                    FROM content_opportunities
                    WHERE status = 'IDEA'
                    ORDER BY created_at DESC LIMIT 5
                `).all();
            }

            const formattedOpps = pendingOpps.map(o => ({
                id: o.id,
                title: o.title,
                targetAudience: o.target_audience,
                problem: o.problem,
                createdAt: o.created_at
            }));

            // 2. 制作中/活跃内容包
            let inProgressPkgs: any[] = [];
            if (accountId) {
                inProgressPkgs = db.prepare(`
                    SELECT id, title, current_version, updated_at
                    FROM content_packages
                    WHERE account_id = ?
                    ORDER BY updated_at DESC LIMIT 5
                `).all(accountId);
            } else {
                inProgressPkgs = db.prepare(`
                    SELECT id, title, current_version, updated_at
                    FROM content_packages
                    ORDER BY updated_at DESC LIMIT 5
                `).all();
            }

            const formattedPkgs = inProgressPkgs.map(p => ({
                id: p.id,
                title: p.title,
                currentVersion: p.current_version,
                updatedAt: p.updated_at
            }));

            // 3. 待人工确认并发布的草稿数 (未完成发布的草稿)
            let readyDraftsCount = 0;
            try {
                const row = db.prepare(`
                    SELECT COUNT(*) as count FROM drafts
                    WHERE published_note_id IS NULL OR published_note_id = ''
                `).get() as { count: number };
                readyDraftsCount = row?.count || 0;
            } catch (_) {}

            // 4. 监听中的需求雷达数
            let radarCount = 0;
            try {
                if (accountId) {
                    const row = db.prepare(`
                        SELECT COUNT(*) as count FROM demand_radar_watches
                        WHERE account_id = ? AND is_active = 1
                    `).get(accountId) as { count: number };
                    radarCount = row?.count || 0;
                } else {
                    const row = db.prepare(`
                        SELECT COUNT(*) as count FROM demand_radar_watches
                        WHERE is_active = 1
                    `).get() as { count: number };
                    radarCount = row?.count || 0;
                }
            } catch (_) {}

            return {
                pending_opportunities: formattedOpps,
                in_progress_packages: formattedPkgs,
                ready_to_publish_count: readyDraftsCount,
                active_radar_watches_count: radarCount
            };
        } catch (e) {
            return {
                pending_opportunities: [],
                in_progress_packages: [],
                ready_to_publish_count: 0,
                active_radar_watches_count: 0
            };
        }
    }

    /**
     * 收集所有待处理的紧急事项，按优先级排序
     */
    private static collectUrgentTasks(accountId?: number, todayActions?: TodayActions): UrgentItem[] {
        const items: UrgentItem[] = [];

        // 1. 待决策机会卡（优先提醒创作者决策）
        if (todayActions && todayActions.pending_opportunities.length > 0) {
            items.push({
                type: 'opportunity_pending',
                priority: 'high',
                title: `${todayActions.pending_opportunities.length} 个新选题机会卡待决策`,
                description: '来自用户真实痛点与雷达合成，请确认采纳或暂缓',
                action_link: '/opportunities',
                count: todayActions.pending_opportunities.length,
            });
        }

        // 2. 待回复评论（高优先级）
        try {
            const pendingReplyCount = db.prepare(`
                SELECT COUNT(*) as count FROM comments 
                WHERE reply_status = 'PENDING' OR reply_status = 'UNREPLIED'
            `).get() as { count: number };

            if (pendingReplyCount && pendingReplyCount.count > 0) {
                let negativeCount = 0;
                try {
                    const neg = db.prepare(`
                        SELECT COUNT(*) as count FROM comments 
                        WHERE (reply_status = 'PENDING' OR reply_status = 'UNREPLIED')
                        AND intent = 'COMPLAINT'
                    `).get() as { count: number };
                    negativeCount = neg?.count || 0;
                } catch (_) {}

                items.push({
                    type: 'reply_comments',
                    priority: 'high',
                    title: `${pendingReplyCount.count} 条新评论待回复`,
                    description: negativeCount > 0
                        ? `其中 ${negativeCount} 条是差评，建议优先处理`
                        : '及时回复可提升账号互动率',
                    action_link: '/engagement?filter=PENDING',
                    count: pendingReplyCount.count,
                });
            }
        } catch (_) {}

        // 3. 失败任务告警（高优先级）
        try {
            const failedTasks = db.prepare(`
                SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED'
            `).get() as { count: number };

            if (failedTasks && failedTasks.count > 0) {
                items.push({
                    type: 'task_failed',
                    priority: 'high',
                    title: `${failedTasks.count} 个任务执行失败`,
                    description: '请前往任务中心查看详情并重试',
                    action_link: '/tasks',
                    count: failedTasks.count,
                });
            }
        } catch (_) {}

        // 4. 竞品动态告警（中优先级）
        try {
            const recentCompetitors = db.prepare(`
                SELECT nickname FROM competitors 
                WHERE status = 'active'
                LIMIT 5
            `).all() as { nickname: string }[];

            if (recentCompetitors && recentCompetitors.length > 0) {
                const names = recentCompetitors.map(c => c.nickname).join('、');
                items.push({
                    type: 'competitor_alert',
                    priority: 'medium',
                    title: `${recentCompetitors.length} 个对标账号监控中`,
                    description: `${names} 正在持续追踪`,
                    action_link: '/competitor',
                    count: recentCompetitors.length,
                });
            }
        } catch (_) {}

        // 按优先级排序：high > medium > low
        items.sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.priority] - order[b.priority];
        });

        return items;
    }

    /**
     * 计算数据概要
     */
    private static calculateSummary(): SummaryData | null {
        try {
            const history = AnalyticsService.getHistory();
            if (!history || history.length === 0) return null;

            const dailyMap = new Map<string, any>();
            for (const item of history) {
                const dateStr = (item.record_time || '').replace(' ', 'T').split('T')[0];
                if (!dateStr) continue;
                if (!dailyMap.has(dateStr)) {
                    dailyMap.set(dateStr, { views: 0, likes: 0, comments: 0, collects: 0, date: dateStr });
                }
                const entry = dailyMap.get(dateStr);
                entry.views += (item.views || 0);
                entry.likes += (item.likes || 0);
                entry.comments += (item.comments || 0);
                entry.collects += (item.collects || 0);
            }

            const sortedDays = Array.from(dailyMap.values())
                .sort((a: any, b: any) => a.date.localeCompare(b.date));

            if (sortedDays.length < 2) return null;

            const today = sortedDays[sortedDays.length - 1];
            const yesterday = sortedDays[sortedDays.length - 2];

            const readsDiff = today.views - yesterday.views;
            const likesDiff = today.likes - yesterday.likes;
            const commentsDiff = today.comments - yesterday.comments;
            const collectsDiff = today.collects - yesterday.collects;

            const readsChange = yesterday.views > 0 ? Math.round((readsDiff / yesterday.views) * 100) : 0;
            const likesChange = yesterday.likes > 0 ? Math.round((likesDiff / yesterday.likes) * 100) : 0;
            const commentsChange = yesterday.comments > 0 ? Math.round((commentsDiff / yesterday.comments) * 100) : 0;
            const collectsChange = yesterday.collects > 0 ? Math.round((collectsDiff / yesterday.collects) * 100) : 0;

            return {
                date_range: {
                    start: yesterday.date,
                    end: today.date,
                },
                reads_change: readsChange,
                likes_change: likesChange,
                followers_change: 0,
                comments_change: commentsChange,
                collects_change: collectsChange,
                top_note_title: '近期笔记表现平稳',
                top_note_metric: `${today.likes} 点赞`,
            };
        } catch (_) {
            return null;
        }
    }

    /**
     * 内容日历预览
     */
    private static getCalendarPreview(): CalendarPreview {
        try {
            const today = new Date().toISOString().split('T')[0];

            let todayScheduled = 0;
            try {
                const res = db.prepare(`
                    SELECT COUNT(*) as count FROM tasks 
                    WHERE scheduled_at LIKE ? AND type = 'PUBLISH_NOTE'
                `).get(`${today}%`) as { count: number };
                todayScheduled = res?.count || 0;
            } catch (_) {}

            let draftsCount = 0;
            try {
                const res = db.prepare(`
                    SELECT COUNT(*) as count FROM drafts WHERE published_note_id IS NULL
                `).get() as { count: number };
                draftsCount = res?.count || 0;
            } catch (_) {}

            return {
                today_scheduled: todayScheduled,
                this_week_remaining: draftsCount,
                next_deadline: null,
            };
        } catch (_) {
            return { today_scheduled: 0, this_week_remaining: 0, next_deadline: null };
        }
    }

    /**
     * 生成运营建议
     */
    private static generateSuggestions(accountId?: number, todayActions?: TodayActions): Suggestion[] {
        const suggestions: Suggestion[] = [];

        // 1. 如果没有布设雷达
        if (todayActions && todayActions.active_radar_watches_count === 0) {
            suggestions.push({
                type: 'opportunity_gap',
                title: '布设关键词需求雷达',
                description: '当前账号尚未开启关键词雷达，建议布设以自动捕获行业痛点与商机',
                action_link: '/radar',
            });
        }

        // 2. 如果有很多待决策机会卡
        if (todayActions && todayActions.pending_opportunities.length >= 3) {
            suggestions.push({
                type: 'opportunity_gap',
                title: '及时消化选题池',
                description: `储备了 ${todayActions.pending_opportunities.length} 个待决策选题，建议采纳优质项进入内容包`,
                action_link: '/opportunities',
            });
        }

        return suggestions;
    }
}
