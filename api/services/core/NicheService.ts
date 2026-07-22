/**
 * 文件功能：选题挖掘 Service 层，封装基于关键词的笔记搜索、分类和导出查询
 * 主要类/函数：NicheService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

export class NicheService {
    /**
     * 功能描述：分页查询搜索结果笔记，支持多条件筛选与排序
     *
     * 参数说明：
     * - params: [object] 查询条件集合
     *   - keyword: [string] 搜索关键词筛选
     *   - sort: [string] 排序字段 'likes'|'collects'|'comments'|'date'
     *   - page: [number] 页码
     *   - pageSize: [number] 每页条数
     *   - hasAnalysis: [boolean] 仅查询有 AI 分析的笔记
     *   - topic: [string] 按子主题标签筛选
     *
     * 返回说明：
     * - { data: any[], total: number, page: number, pageSize: number }
     *
     * NOTE: 动态 WHERE 拼接全部参数化绑定，topic 使用 LIKE 匹配 JSON 数组
     */
    static searchNotes(params: {
        keyword?: string;
        sort?: string;
        page: number;
        pageSize: number;
        hasAnalysis?: boolean;
        topic?: string;
    }): { data: any[]; total: number; page: number; pageSize: number } {
        const { keyword, sort, page, pageSize, hasAnalysis, topic } = params;
        const offset = (page - 1) * pageSize;

        // 动态构建 WHERE 条件（仅查询有搜索关键词的笔记）
        const conditions: string[] = ['search_keyword IS NOT NULL'];
        const queryParams: any[] = [];

        if (keyword) {
            conditions.push('search_keyword = ?');
            queryParams.push(keyword.trim());
        }

        if (hasAnalysis) {
            conditions.push('analysis_result IS NOT NULL');
        }

        if (topic) {
            conditions.push("topic_tags LIKE ?");
            queryParams.push(`%"${topic}"%`);
        }

        const whereClause = conditions.join(' AND ');

        // 构建排序子句
        let orderBy = 'likes_count DESC';
        if (sort === 'collects') orderBy = 'collects_count DESC';
        else if (sort === 'comments') orderBy = 'comments_count DESC';
        else if (sort === 'date') orderBy = 'scraped_at DESC';

        // 查询分页数据
        const notes = db.prepare(`
            SELECT * FROM trending_notes
            WHERE ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `).all(...queryParams, pageSize, offset) as any[];

        // 查询总数
        const countResult = db.prepare(`
            SELECT COUNT(*) as count FROM trending_notes
            WHERE ${whereClause}
        `).get(...queryParams) as { count: number };

        // 解析 JSON 字段（单条损坏不影响整体）
        const parsedNotes = notes.map((n: any) => {
            try {
                return {
                    ...n,
                    tags: n.tags ? JSON.parse(n.tags) : [],
                    analysis_result: n.analysis_result ? JSON.parse(n.analysis_result) : null,
                    images: n.images ? JSON.parse(n.images) : []
                };
            } catch (e) {
                console.error(`[Niche] Failed to parse note id=${n.id}:`, e);
                return { ...n, tags: [], analysis_result: null, images: [], _parseError: true };
            }
        });

        return {
            data: parsedNotes,
            total: countResult.count,
            page,
            pageSize
        };
    }

    /**
     * 功能描述：获取所有搜索关键词及其结果数量（按最近抓取时间排序）
     *
     * 返回说明：
     * - { keyword: string, count: number, last_scraped: string }[]
     */
    static getKeywords(): { keyword: string; count: number; last_scraped: string }[] {
        return db.prepare(`
            SELECT search_keyword as keyword, COUNT(*) as count, MAX(scraped_at) as last_scraped
            FROM trending_notes
            WHERE search_keyword IS NOT NULL
            GROUP BY search_keyword
            ORDER BY last_scraped DESC
        `).all() as { keyword: string; count: number; last_scraped: string }[];
    }

    /**
     * 功能描述：获取所有子主题标签及其使用次数（按次数倒序）
     *
     * 参数说明：
     * - keyword: [string | undefined] 按搜索关键词筛选
     *
     * 返回说明：
     * - { name: string, count: number }[]
     *
     * NOTE: topic_tags 是 JSON 数组字符串，需解析后聚合统计
     */
    static getTopics(keyword?: string): { name: string; count: number }[] {
        let whereClause = 'topic_tags IS NOT NULL';
        const params: any[] = [];

        if (keyword) {
            whereClause += ' AND search_keyword = ?';
            params.push(keyword);
        }

        const rows = db.prepare(`
            SELECT topic_tags
            FROM trending_notes
            WHERE ${whereClause}
        `).all(...params) as Array<{ topic_tags: string }>;

        // 解析 JSON 数组并统计每个标签出现次数
        const tagCount: Record<string, number> = {};
        for (const row of rows) {
            try {
                const tags = JSON.parse(row.topic_tags);
                if (Array.isArray(tags)) {
                    for (const tag of tags) {
                        tagCount[tag] = (tagCount[tag] || 0) + 1;
                    }
                }
            } catch (e) {
                // 跳过无效 JSON
            }
        }

        // 按次数倒序排序
        return Object.entries(tagCount)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }));
    }

    /**
     * 功能描述：查询导出用笔记数据（最多 200 条，按点赞数倒序）
     *
     * 参数说明：
     * - keyword: [string | undefined] 按搜索关键词筛选
     * - topic: [string | undefined] 按子主题筛选
     *
     * 返回说明：
     * - any[] 原始笔记记录数组（未解析 JSON 字段，由路由层格式化）
     */
    static getExportNotes(keyword?: string, topic?: string): any[] {
        const conditions: string[] = ['search_keyword IS NOT NULL'];
        const params: any[] = [];

        if (keyword) {
            conditions.push('search_keyword = ?');
            params.push(keyword.trim());
        }

        if (topic) {
            conditions.push("topic_tags LIKE ?");
            params.push(`%"${topic}"%`);
        }

        const whereClause = conditions.join(' AND ');

        // 导出最多 200 条，按点赞数倒序
        return db.prepare(`
            SELECT * FROM trending_notes
            WHERE ${whereClause}
            ORDER BY likes_count DESC
            LIMIT 200
        `).all(...params) as any[];
    }
}
