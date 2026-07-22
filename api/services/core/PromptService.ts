/**
 * 文件功能：Prompt 模板管理（prompt_templates 表）Service 层
 * 主要类/函数：PromptService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

export class PromptService {
    /**
     * 功能描述：获取所有 Prompt 模板（默认模板优先，其次按创建时间倒序）
     *
     * 返回说明：
     * - any[] 模板数组
     */
    static getAllTemplates(): any[] {
        return db.prepare('SELECT * FROM prompt_templates ORDER BY is_default DESC, created_at DESC').all();
    }

    /**
     * 功能描述：创建新 Prompt 模板
     *
     * 参数说明：
     * - name: [string] 模板名称（必填）
     * - description: [string] 模板描述
     * - template: [string] 模板内容（必填）
     *
     * 返回说明：
     * - number | bigint 新模板 ID
     */
    static createTemplate(name: string, description: string, template: string): number | bigint {
        const info = db.prepare('INSERT INTO prompt_templates (name, description, template) VALUES (?, ?, ?)')
            .run(name, description || '', template);
        return info.lastInsertRowid;
    }

    /**
     * 功能描述：检查模板是否为默认模板（默认模板禁止删除）
     *
     * 参数说明：
     * - id: [number | string] 模板 ID
     *
     * 返回说明：
     * - { is_default: number } | undefined
     */
    static getTemplateDefaultFlag(id: number | string): { is_default: number } | undefined {
        return db.prepare('SELECT is_default FROM prompt_templates WHERE id = ?').get(id) as { is_default: number } | undefined;
    }

    /**
     * 功能描述：删除模板
     *
     * 参数说明：
     * - id: [number | string] 模板 ID
     */
    static deleteTemplate(id: number | string): void {
        db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);
    }
}
