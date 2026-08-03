/**
 * 文件功能：草稿管理（drafts 表）Service 层，封装草稿的数据库操作
 * 主要类/函数：DraftService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

/**
 * 解析后的草稿（JSON 字段已转对象）
 */
export interface ParsedDraft {
    id: number;
    title: string;
    content: string;
    tags: any[];
    images: any[];
    content_type: string;
    meta_data: any | null;
    created_at: string;
    updated_at: string;
}

export class DraftService {
    /**
     * 功能描述：获取所有草稿（按创建时间倒序）
     *
     * 返回说明：
     * - ParsedDraft[] 解析后的草稿数组
     *
     * NOTE: 单条记录解析失败不影响整体返回，会标记 _parseError
     */
    static getAllDrafts(): ParsedDraft[] {
        const drafts = db.prepare('SELECT * FROM drafts ORDER BY created_at DESC').all() as any[];

        return drafts.map((d: any) => {
            try {
                return {
                    ...d,
                    tags: JSON.parse(d.tags || '[]'),
                    images: JSON.parse(d.images || '[]'),
                    meta_data: d.meta_data ? JSON.parse(d.meta_data) : null
                };
            } catch (e) {
                console.error(`[Drafts] Failed to parse draft id=${d.id}:`, e);
                return { ...d, tags: [], images: [], meta_data: null, _parseError: true } as ParsedDraft;
            }
        });
    }

    /**
     * 功能描述：创建新草稿
     *
     * 参数说明：
     * - data: [object] 草稿数据
     *   - title: [string] 标题
     *   - content: [string] 正文
     *   - tags: [any[]] 标签数组（序列化存储）
     *   - images: [any[]] 图片数组（已本地化，序列化存储）
     *   - contentType: [string] 内容类型，默认 'note'
     *   - meta_data: [any | undefined] 元数据（序列化存储）
     *
     * 返回说明：
     * - number | bigint 新草稿的 ID
     */
    static createDraft(data: {
        title: string;
        content: string;
        tags?: any[];
        images?: any[];
        contentType?: string;
        meta_data?: any;
    }): number | bigint {
        const info = db.prepare('INSERT INTO drafts (title, content, tags, images, content_type, meta_data) VALUES (?, ?, ?, ?, ?, ?)')
            .run(
                data.title,
                data.content,
                JSON.stringify(data.tags || []),
                JSON.stringify(data.images || []),
                data.contentType || 'note',
                data.meta_data ? JSON.stringify(data.meta_data) : null
            );

        return info.lastInsertRowid;
    }

    /**
     * 功能描述：更新草稿
     *
     * 参数说明：
     * - id: [number | string] 草稿 ID
     * - data: [object] 待更新字段（同 createDraft 的 data）
     */
    static updateDraft(id: number | string, data: {
        title: string;
        content: string;
        tags?: any[];
        images?: any[];
        contentType?: string;
        meta_data?: any;
    }): void {
        db.prepare('UPDATE drafts SET title = ?, content = ?, tags = ?, images = ?, content_type = COALESCE(?, content_type), meta_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(
                data.title,
                data.content,
                JSON.stringify(data.tags || []),
                JSON.stringify(data.images || []),
                data.contentType,
                data.meta_data ? JSON.stringify(data.meta_data) : null,
                id
            );
    }

    /**
     * 功能描述：获取草稿的图片列表（用于删除草稿时清理本地文件）
     *
     * 参数说明：
     * - id: [number | string] 草稿 ID
     *
     * 返回说明：
     * - string[] 图片 URL 数组（兼容字符串和对象两种格式）
     */
    static getDraftImages(id: number | string): string[] {
        const draft = db.prepare('SELECT images FROM drafts WHERE id = ?').get(id) as any;
        if (!draft) return [];

        try {
            const parsed = JSON.parse(draft.images || '[]');
            // 兼容 string[] 和 {url, prompt}[] 两种格式
            return parsed.map((img: any) => typeof img === 'string' ? img : img.url);
        } catch {
            return [];
        }
    }

    /**
     * 功能描述：获取已排期的草稿（scheduled_at 不为空），按日期分组
     *
     * 返回说明：
     * - { date: string; drafts: { id: number; title: string; contentType: string; scheduledAt: string }[] }[]
     *
     * 使用示例：
     * >>> const scheduled = DraftService.getScheduledDrafts();
     * >>> console.log(scheduled.length, '个日期有待发内容');
     */
    static getScheduledDrafts(): {
        date: string;
        drafts: { id: number; title: string; contentType: string; scheduledAt: string }[];
    }[] {
        const rows = db.prepare(`
            SELECT id, title, content_type, scheduled_at
            FROM drafts
            WHERE scheduled_at IS NOT NULL
            ORDER BY scheduled_at ASC
        `).all() as { id: number; title: string; content_type: string; scheduled_at: string }[];

        // 按日期分组（只取日期部分 yyyy-MM-dd）
        const grouped: Record<string, { id: number; title: string; contentType: string; scheduledAt: string }[]> = {};
        for (const row of rows) {
            const dateKey = row.scheduled_at.substring(0, 10);
            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push({
                id: row.id,
                title: row.title,
                contentType: row.content_type,
                scheduledAt: row.scheduled_at,
            });
        }

        return Object.entries(grouped).map(([date, drafts]) => ({ date, drafts }));
    }

    /**
     * 功能描述：删除草稿记录（不含文件清理，文件清理由调用方处理）
     *
     * 参数说明：
     * - id: [number | string] 草稿 ID
     */
    static deleteDraft(id: number | string): void {
        db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
    }
}
