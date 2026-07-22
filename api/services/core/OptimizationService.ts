/**
 * 文件功能：Prompt 优化记录（prompt_optimizations 表）Service 层
 * 主要类/函数：OptimizationService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

export class OptimizationService {
    /**
     * 功能描述：获取优化记录列表，支持按状态筛选
     *
     * 参数说明：
     * - status: [string | undefined] 状态筛选，如 'PENDING'、'APPLIED'、'REJECTED'
     *
     * 返回说明：
     * - any[] 优化记录数组，performance_metrics 已解析为对象
     *
     * 使用示例：
     * >>> const list = OptimizationService.listOptimizations('PENDING');
     * >>> console.log(list.length);
     *
     * NOTE: 单条记录解析失败不影响整体返回，会标记 _parseError
     */
    static listOptimizations(status?: string): any[] {
        let query = 'SELECT * FROM prompt_optimizations';
        const params: any[] = [];

        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        query += ' ORDER BY created_at DESC';

        const data = db.prepare(query).all(...params) as any[];

        // 解析 performance_metrics（单条损坏不影响整体）
        return data.map((item: any) => {
            try {
                return {
                    ...item,
                    performance_metrics: item.performance_metrics ? JSON.parse(item.performance_metrics) : null
                };
            } catch (e) {
                console.error(`[Optimizations] Failed to parse item id=${item.id}:`, e);
                return { ...item, performance_metrics: null, _parseError: true };
            }
        });
    }

    /**
     * 功能描述：应用优化（更新 prompt 模板并标记优化记录为已应用）
     *
     * 参数说明：
     * - id: [number | string] 优化记录 ID
     *
     * 返回说明：
     * - { success: boolean, error?: string }
     *
     * 异常情况：
     * - 优化记录不存在：{ success: false, error: 'Optimization not found' }
     * - 已应用过：{ success: false, error: 'Already applied' }
     *
     * NOTE: 操作在事务中执行，模板更新与状态标记原子化
     */
    static applyOptimization(id: number | string): { success: boolean; error?: string } {
        // 1. 查询优化记录
        const opt = db.prepare('SELECT * FROM prompt_optimizations WHERE id = ?').get(id) as any;
        if (!opt) return { success: false, error: 'Optimization not found' };
        if (opt.status === 'APPLIED') return { success: false, error: 'Already applied' };

        // 2. 事务内更新模板并标记状态
        db.transaction(() => {
            if (opt.original_template_id) {
                // 有关联的原模板：直接更新
                db.prepare('UPDATE prompt_templates SET template = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(opt.optimized_template, opt.original_template_id);
            } else {
                // 无原模板（动态风格）：按 target_style 查找，存在则更新，不存在则新建
                const existing = db.prepare('SELECT id FROM prompt_templates WHERE name = ?').get(opt.target_style) as any;
                if (existing) {
                    db.prepare('UPDATE prompt_templates SET template = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                        .run(opt.optimized_template, existing.id);
                } else {
                    db.prepare('INSERT INTO prompt_templates (name, description, template, is_default, version) VALUES (?, ?, ?, 0, 1)')
                        .run(opt.target_style, `AI Optimized for ${opt.target_style}`, opt.optimized_template);
                }
            }

            // 3. 标记优化记录为已应用
            db.prepare("UPDATE prompt_optimizations SET status = 'APPLIED' WHERE id = ?").run(id);
        })();

        return { success: true };
    }

    /**
     * 功能描述：拒绝优化记录
     *
     * 参数说明：
     * - id: [number | string] 优化记录 ID
     */
    static rejectOptimization(id: number | string): void {
        db.prepare("UPDATE prompt_optimizations SET status = 'REJECTED' WHERE id = ?").run(id);
    }
}
