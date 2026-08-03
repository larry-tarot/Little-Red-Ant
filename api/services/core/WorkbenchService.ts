/**
 * 文件功能：今日工作台聚合 Service，整合多模块数据生成统一工作台视图
 * 主要类/函数：WorkbenchService
 * 作者：AI Assistant
 * 创建时间：2026-07-31
 *
 * 设计思路：
 * - 从评论、数据、任务、竞品、通知等模块聚合数据
 * - 按优先级排序：紧急事项 > 数据概要 > 日历预览 > 运营建议
 * - 不重写业务逻辑，只做聚合和排序
 */

import db from '../../db.js';
import { AccountService } from './AccountService.js';
import { AnalyticsService } from './AnalyticsService.js';

/**
 * 紧急事项结构
 */
export interface UrgentItem {
    type: 'reply_comments' | 'anomaly_note' | 'competitor_alert' | 'task_failed' | 'anomaly_burst';
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
    type: 'competitor_learn' | 'content_gap' | 'best_posting_time' | 'unreplied_high';
    title: string;
    description: string;
    action_link: string;
}

/**
 * 今日工作台完整响应结构
 */
export interface TodayWorkbench {
    urgent_tasks: UrgentItem[];
    summary: SummaryData | null;
    calendar_preview: CalendarPreview;
    suggestions: Suggestion[];
    account_name: string;
}

export class WorkbenchService {
    /**
     * 功能描述：聚合各模块数据，生成今日工作台视图
     *
     * 返回说明：
     * - TodayWorkbench 包含紧急事项、数据概要、日历预览、运营建议
     *
     * 使用示例：
     * >>> const wb = WorkbenchService.getTodayWorkbench();
     * >>> console.log(wb.urgent_tasks.length);
     */
    static getTodayWorkbench(): TodayWorkbench {
        const activeAccount = AccountService.getActiveAccount();
        const accountName = activeAccount?.nickname || '未绑定账号';

        // 1. 收集紧急事项
        const urgentTasks = this.collectUrgentTasks();

        // 2. 计算数据概要
        const summary = this.calculateSummary();

        // 3. 日历预览
        const calendarPreview = this.getCalendarPreview();

        // 4. 运营建议
        const suggestions = this.generateSuggestions();

        return {
            urgent_tasks: urgentTasks,
            summary,
            calendar_preview: calendarPreview,
            suggestions,
            account_name: accountName,
        };
    }

    /**
     * 收集所有待处理的紧急事项，按优先级排序
     */
    private static collectUrgentTasks(): UrgentItem[] {
        const items: UrgentItem[] = [];

        try {
            // 1. 待回复评论（高优先级）
            const pendingReplyCount = db.prepare(`
                SELECT COUNT(*) as count FROM comments 
                WHERE reply_status = 'PENDING' OR reply_status = 'UNREPLIED'
            `).get() as { count: number };

            if (pendingReplyCount.count > 0) {
                // 检查是否有差评
                const negativeCount = db.prepare(`
                    SELECT COUNT(*) as count FROM comments 
                    WHERE (reply_status = 'PENDING' OR reply_status = 'UNREPLIED')
                    AND intent = 'COMPLAINT'
                `).get() as { count: number };

                items.push({
                    type: 'reply_comments',
                    priority: 'high',
                    title: `${pendingReplyCount.count} 条新评论待回复`,
                    description: negativeCount.count > 0
                        ? `其中 ${negativeCount.count} 条是差评，建议优先处理`
                        : '及时回复可提升账号互动率',
                    action_link: '/engagement?filter=PENDING',
                    count: pendingReplyCount.count,
                });
            }

            // 2. 失败任务告警（高优先级）
            const failedTasks = db.prepare(`
                SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED'
            `).get() as { count: number };

            if (failedTasks.count > 0) {
                items.push({
                    type: 'task_failed',
                    priority: 'high',
                    title: `${failedTasks.count} 个任务执行失败`,
                    description: '请前往任务中心查看详情并重试',
                    action_link: '/tasks',
                    count: failedTasks.count,
                });
            }

            // 3. 竞品动态告警（中优先级）
            const recentCompetitors = db.prepare(`
                SELECT nickname, updated_at FROM competitors 
                WHERE status = 'active' 
                AND updated_at >= datetime('now', '-1 day')
                ORDER BY updated_at DESC 
                LIMIT 5
            `).all() as { nickname: string; updated_at: string }[];

            if (recentCompetitors.length > 0) {
                const names = recentCompetitors.map(c => c.nickname).join('、');
                items.push({
                    type: 'competitor_alert',
                    priority: 'medium',
                    title: `${recentCompetitors.length} 个对标账号更新了内容`,
                    description: `${names} 昨天发布了新内容，建议查看`,
                    action_link: '/competitor',
                    count: recentCompetitors.length,
                });
            }

            // 4. 异常笔记检测（中优先级）— 单篇笔记点赞/收藏增长过快(可能爆了)
            const burstNotes = db.prepare(`
                SELECT title, likes FROM notes 
                WHERE likes > (
                    SELECT AVG(likes) * 3 FROM notes WHERE likes > 0
                )
                AND likes > 50
                ORDER BY likes DESC 
                LIMIT 3
            `).all() as { title: string; likes: number }[];

            for (const note of burstNotes) {
                items.push({
                    type: 'anomaly_burst',
                    priority: 'medium',
                    title: `笔记「${note.title.substring(0, 15)}...」表现异常好`,
                    description: `获得 ${note.likes} 赞，建议追加评论引流`,
                    action_link: '/notes',
                    count: note.likes,
                });
            }
        } catch (error) {
            console.error('[WorkbenchService] collectUrgentTasks failed:', error);
        }

        // 按优先级排序：high > medium > low
        items.sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.priority] - order[b.priority];
        });

        return items;
    }

    /**
     * 计算昨日 / 本周数据概要（环比变化）
     */
    private static calculateSummary(): SummaryData | null {
        try {
            const history = AnalyticsService.getHistory();
            if (!history || history.length === 0) return null;

            // 按日期分组计算每日汇总
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

            // 获取 Top 笔记
            const topNote = db.prepare(`
                SELECT title, likes FROM notes 
                ORDER BY likes DESC LIMIT 1
            `).get() as { title: string; likes: number } | undefined;

            return {
                date_range: {
                    start: yesterday.date,
                    end: today.date,
                },
                reads_change: this.calcChange(yesterday.views, today.views),
                likes_change: this.calcChange(yesterday.likes, today.likes),
                followers_change: 0, // followers 需要单独字段,暂时从数据库取
                comments_change: this.calcChange(yesterday.comments, today.comments),
                collects_change: this.calcChange(yesterday.collects, today.collects),
                top_note_title: topNote?.title || '',
                top_note_metric: topNote ? `点赞 ${topNote.likes}` : '',
            };
        } catch (error) {
            console.error('[WorkbenchService] calculateSummary failed:', error);
            return null;
        }
    }

    /**
     * 计算环比变化百分比
     */
    private static calcChange(prev: number, curr: number): number {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    }

    /**
     * 获取内容日历预览
     */
    private static getCalendarPreview(): CalendarPreview {
        try {
            const today = new Date().toISOString().split('T')[0];

            // 今日待发布任务数
            const todayScheduled = db.prepare(`
                SELECT COUNT(*) as count FROM tasks 
                WHERE scheduled_at LIKE ?
                AND type = 'PUBLISH_NOTE'
            `).get(`${today}%`) as { count: number };

            // 本周剩余待发布数
            const weekEnd = this.getWeekEnd();
            const weekRemaining = db.prepare(`
                SELECT COUNT(*) as count FROM tasks 
                WHERE scheduled_at > ?
                AND scheduled_at <= ?
                AND type = 'PUBLISH_NOTE'
            `).get(`${today}T23:59:59`, weekEnd) as { count: number };

            // 草稿箱中待排期的笔记
            const draftsCount = db.prepare(`
                SELECT COUNT(*) as count FROM drafts
                WHERE status = 'active'
            `).get() as { count: number };

            // 最近一个截止时间
            const nextDeadline = db.prepare(`
                SELECT scheduled_at FROM tasks 
                WHERE scheduled_at > datetime('now')
                AND type = 'PUBLISH_NOTE'
                ORDER BY scheduled_at ASC LIMIT 1
            `).get() as { scheduled_at: string } | undefined;

            return {
                today_scheduled: todayScheduled.count,
                this_week_remaining: weekRemaining.count + draftsCount.count,
                next_deadline: nextDeadline?.scheduled_at || null,
            };
        } catch (error) {
            console.error('[WorkbenchService] getCalendarPreview failed:', error);
            return { today_scheduled: 0, this_week_remaining: 0, next_deadline: null };
        }
    }

    /**
     * 生成运营建议
     */
    private static generateSuggestions(): Suggestion[] {
        const suggestions: Suggestion[] = [];

        try {
            // 1. 检查是否有竞品值得学习
            const competitorCount = db.prepare(`
                SELECT COUNT(*) as count FROM competitors WHERE status = 'active'
            `).get() as { count: number };

            if (competitorCount.count > 0) {
                suggestions.push({
                    type: 'competitor_learn',
                    title: '对标账号内容值得学习',
                    description: `你有 ${competitorCount.count} 个活跃对标账号，查看最新内容获取灵感`,
                    action_link: '/competitor',
                });
            }

            // 2. 检查是否有未回复的高互动评论
            const unrepliedHigh = db.prepare(`
                SELECT COUNT(*) as count FROM comments 
                WHERE reply_status = 'PENDING' 
                AND intent IN ('INQUIRY', 'PRAISE')
            `).get() as { count: number };

            if (unrepliedHigh.count > 0) {
                suggestions.push({
                    type: 'unreplied_high',
                    title: `有 ${unrepliedHigh.count} 条高价值评论待回复`,
                    description: '询单和好评是转化的关键，建议优先回复',
                    action_link: '/engagement?filter=PENDING',
                });
            }

            // 3. 检查内容产出频率
            const weeklyNotes = db.prepare(`
                SELECT COUNT(*) as count FROM notes 
                WHERE created_at >= datetime('now', '-7 days')
            `).get() as { count: number };

            if (weeklyNotes.count < 3) {
                suggestions.push({
                    type: 'content_gap',
                    title: '本周内容产出偏低',
                    description: `本周仅发布了 ${weeklyNotes.count} 篇笔记，建议保持每周 3-5 篇的更新频率`,
                    action_link: '/generate',
                });
            }

            // 4. 建议查看热点趋势
            suggestions.push({
                type: 'best_posting_time',
                title: '关注当前热点趋势',
                description: '结合热点选题创作，更容易获得平台流量推荐',
                action_link: '/topic-mining',
            });
        } catch (error) {
            console.error('[WorkbenchService] generateSuggestions failed:', error);
        }

        return suggestions;
    }

    /**
     * 获取本周结束日期（周日 23:59:59）
     */
    private static getWeekEnd(): string {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=周日
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const sunday = new Date(now);
        sunday.setDate(now.getDate() + daysUntilSunday);
        return sunday.toISOString().split('T')[0] + 'T23:59:59';
    }
}
