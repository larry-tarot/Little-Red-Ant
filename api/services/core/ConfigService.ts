/**
 * 文件功能：系统配置 Service 层，封装 RPA 选择器的 CRUD
 * 主要类/函数：ConfigService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

export class ConfigService {
    /**
     * 功能描述：获取所有 RPA 选择器配置（按 platform、category、key 排序）
     *
     * 返回说明：
     * - any[] 选择器数组
     */
    static getAllSelectors(): any[] {
        return db.prepare('SELECT * FROM rpa_selectors ORDER BY platform, category, key').all();
    }

    /**
     * 功能描述：创建或更新 RPA 选择器（UPSERT 语义）
     *
     * 参数说明：
     * - platform: [string] 平台，默认 'xiaohongshu'
     * - category: [string] 分类
     * - key: [string] 选择器键
     * - selector: [string] CSS/XPath 选择器
     * - description: [string] 描述
     *
     * NOTE: ON CONFLICT 实现 UPSERT，需 (platform, category, key) 唯一约束
     */
    static upsertSelector(platform: string, category: string, key: string, selector: string, description?: string): void {
        db.prepare(`
            INSERT INTO rpa_selectors (platform, category, key, selector, description, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(platform, category, key)
            DO UPDATE SET selector = excluded.selector, description = excluded.description, updated_at = CURRENT_TIMESTAMP
        `).run(platform, category, key, selector, description);
    }

    /**
     * 功能描述：删除 RPA 选择器
     *
     * 参数说明：
     * - id: [number | string] 选择器 ID
     */
    static deleteSelector(id: number | string): void {
        db.prepare('DELETE FROM rpa_selectors WHERE id = ?').run(id);
    }
}
