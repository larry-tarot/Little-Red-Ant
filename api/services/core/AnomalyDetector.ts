/**
 * 文件功能：异常检测 Service，监控数据异常并自动生成通知
 * 主要类/函数：AnomalyDetector
 * 作者：AI Assistant
 * 创建时间：2026-07-31
 */

import db from '../../db.js';
import { Logger } from '../LoggerService.js';
import { NotificationService } from '../NotificationService.js';

/**
 * 异常检测服务
 *
 * 功能说明：
 * - 检测每日数据指标的统计异常（标准差检测）
 * - 检测爆款笔记（单篇互动远超平均水平）
 * - 检测疑似限流笔记（发布超24h但阅读量异常低）
 * - 自动创建 NotificationService 通知
 *
 * 使用示例：
 * ```typescript
 * const anomalies = AnomalyDetector.runCheck();
 * console.log(`发现异常: ${anomalies.length} 条`);
 * ```
 */
export class AnomalyDetector {

    /**
     * 功能描述：执行一轮异常检测检查
     *
     * 返回说明：
     * - string[] 检测到的异常描述列表
     *
     * 使用示例：
     * >>> const results = AnomalyDetector.runCheck();
     * >>> if (results.length > 0) console.log('发现异常:', results);
     *
     * 检测逻辑：
     * 1. 拉取最近 7 天的每日指标
     * 2. 计算均值与标准差
     * 3. 检查昨日数据是否偏离 2 个标准差
     * 4. 检查是否存在爆款笔记（单篇点赞 > 3倍均值的 AND > 50）
     * 5. 检查是否存在限流笔记（发布超 24h 且阅读量 < 平均的 30%）
     */
    static runCheck(): string[] {
        Logger.info('AnomalyDetector', 'Starting anomaly detection check...');
        const anomalies: string[] = [];

        try {
            // 1. 拉取最近 7 天的每日指标（去重取每日最新快照）
            const dailyMetrics = this.getDailyMetrics(7);
            if (dailyMetrics.length < 2) {
                Logger.info('AnomalyDetector', 'Not enough data for anomaly detection (need >= 2 days)');
                return anomalies;
            }

            // 2. 计算每日总量的均值和标准差
            const { meanLikes } = this.calculateStats(dailyMetrics);

            // 3. 检查昨日数据是否偏离（昨日是数组最后一天）
            const yesterday = dailyMetrics[dailyMetrics.length - 1];
            const daysExceptYesterday = dailyMetrics.slice(0, -1);

            if (daysExceptYesterday.length >= 1) {
                // 重新计算不包括昨天的统计数据，用于比较
                const baselineViews = daysExceptYesterday.map(d => d.total_views);
                const baselineLikes = daysExceptYesterday.map(d => d.total_likes);
                const baselineMeanViews = this.mean(baselineViews);
                const baselineMeanLikes = this.mean(baselineLikes);
                const baselineStdViews = this.stdDev(baselineViews);
                const baselineStdLikes = this.stdDev(baselineLikes);

                // 检查阅读量异常
                const viewsDiff = Math.abs(yesterday.total_views - baselineMeanViews);
                if (baselineStdViews > 0 && viewsDiff > 2 * baselineStdViews) {
                    const direction = yesterday.total_views > baselineMeanViews ? '飙升' : '暴跌';
                    const msg = `昨日阅读量${direction}：${yesterday.total_views}（近7日均值${Math.round(baselineMeanViews)}，标准差${Math.round(baselineStdViews)}）`;
                    anomalies.push(msg);
                    NotificationService.create('WARNING', `数据异常：阅读量${direction}`, msg);
                    Logger.warn('AnomalyDetector', msg);
                }

                // 检查点赞量异常
                const likesDiff = Math.abs(yesterday.total_likes - baselineMeanLikes);
                if (baselineStdLikes > 0 && likesDiff > 2 * baselineStdLikes) {
                    const direction = yesterday.total_likes > baselineMeanLikes ? '飙升' : '暴跌';
                    const msg = `昨日点赞量${direction}：${yesterday.total_likes}（近7日均值${Math.round(baselineMeanLikes)}）`;
                    anomalies.push(msg);
                    NotificationService.create('WARNING', `数据异常：点赞量${direction}`, msg);
                    Logger.warn('AnomalyDetector', msg);
                }
            }

            // 4. 检查爆款笔记（单篇点赞 > 3倍平均点赞 AND > 50）
            const avgLikesPerNote = meanLikes > 0 ? meanLikes : 1;
            const burstThreshold = Math.max(avgLikesPerNote * 3, 50);

            const burstNotes = db.prepare(`
                SELECT note_id, title, likes, views
                FROM note_stats
                WHERE likes > ?
                ORDER BY likes DESC
                LIMIT 5
            `).all(burstThreshold) as any[];

            for (const note of burstNotes) {
                const msg = `爆款笔记：${note.title || '无标题'}（点赞${note.likes}，阅读${note.views}）`;
                anomalies.push(msg);
                NotificationService.create('SUCCESS', '内容爆发通知', msg);
            }

            // 5. 检查限流/沉底笔记（发布超24h但阅读量极低）
            if (avgLikesPerNote > 0) {
                const shadowThreshold = Math.round(avgLikesPerNote * 0.3);
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

                const shadowNotes = db.prepare(`
                    SELECT note_id, title, views, likes, publish_date
                    FROM note_stats
                    WHERE publish_date < ?
                      AND views < ?
                      AND views >= 0
                    ORDER BY views ASC
                    LIMIT 5
                `).all(twentyFourHoursAgo, shadowThreshold) as any[];

                for (const note of shadowNotes) {
                    const msg = `疑似限流笔记：${note.title || '无标题'}（发布${this.getHoursSince(note.publish_date)}h，阅读仅${note.views}，远低于平均水平）`;
                    anomalies.push(msg);
                    NotificationService.create('WARNING', '内容限流预警', msg);
                }
            }

            Logger.info('AnomalyDetector', `Anomaly check completed: ${anomalies.length} anomalies found`);
        } catch (error: any) {
            Logger.error('AnomalyDetector', 'Anomaly detection failed', error);
        }

        return anomalies;
    }

    /**
     * 获取指定天数的每日聚合指标
     *
     * 参数说明：
     * - days: [number] 要查询的天数
     *
     * 返回说明：
     * - 每日指标数组，包含 total_views 和 total_likes
     *
     * NOTE: 从 note_stats_history 表取每日最新快照后聚合
     */
    private static getDailyMetrics(days: number): { record_date: string; total_views: number; total_likes: number }[] {
        try {
            const rows = db.prepare(`
                WITH DailyLatest AS (
                    SELECT
                        note_id,
                        views,
                        likes,
                        date(record_time) as record_date,
                        ROW_NUMBER() OVER (PARTITION BY note_id, date(record_time) ORDER BY record_time DESC) as rn
                    FROM note_stats_history
                    WHERE record_time > datetime('now', '-${days} days')
                )
                SELECT
                    record_date,
                    SUM(views) as total_views,
                    SUM(likes) as total_likes
                FROM DailyLatest
                WHERE rn = 1
                GROUP BY record_date
                ORDER BY record_date ASC
            `).all() as { record_date: string; total_views: number; total_likes: number }[];

            return rows;
        } catch {
            return [];
        }
    }

    /**
     * 计算每日指标数组的统计信息（均值、标准差）
     *
     * 参数说明：
     * - dailyMetrics: 每日指标数组
     *
     * 返回说明：
     * - { meanViews, meanLikes, stdViews, stdLikes }
     */
    private static calculateStats(dailyMetrics: { total_views: number; total_likes: number }[]) {
        const views = dailyMetrics.map(d => d.total_views);
        const likes = dailyMetrics.map(d => d.total_likes);

        return {
            meanViews: this.mean(views),
            meanLikes: this.mean(likes),
            stdViews: this.stdDev(views),
            stdLikes: this.stdDev(likes)
        };
    }

    /**
     * 计算数组均值
     */
    private static mean(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * 计算数组标准差（样本标准差）
     */
    private static stdDev(values: number[]): number {
        if (values.length < 2) return 0;
        const avg = this.mean(values);
        const squareDiffs = values.map(v => Math.pow(v - avg, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
        return Math.sqrt(avgSquareDiff);
    }

    /**
     * 计算自发布日期到现在的经过小时数
     *
     * 参数说明：
     * - publishDate: [string] ISO 日期字符串
     *
     * 返回说明：
     * - number 小时数（整数）
     */
    private static getHoursSince(publishDate: string): number {
        const published = new Date(publishDate).getTime();
        const now = Date.now();
        return Math.max(0, Math.round((now - published) / (1000 * 60 * 60)));
    }
}
