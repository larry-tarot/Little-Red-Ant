/**
 * 文件功能：任务管理（tasks 表）Service 层，封装任务查询和状态更新操作
 * 主要类/函数：TaskService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

export class TaskService {
    /**
     * 功能描述：获取所有活跃任务（PENDING 或 PROCESSING 状态）
     *
     * 返回说明：
     * - any[] 活跃任务数组，payload 和 result 已解析为对象
     *
     * 使用示例：
     * >>> const tasks = TaskService.getActiveTasks();
     * >>> console.log(tasks.length);
     */
    static getActiveTasks(): any[] {
        const tasks = db.prepare(`
            SELECT * FROM tasks
            WHERE status IN ('PENDING', 'PROCESSING')
            ORDER BY created_at DESC
        `).all() as any[];

        return tasks.map(task => this.parseTask(task));
    }

    /**
     * 功能描述：获取任务统计信息（各状态数量）
     *
     * 返回说明：
     * - { pending: number, failed: number, completed: number }
     */
    static getTaskStats(): { pending: number; failed: number; completed: number } {
        const stats = db.prepare(`
            SELECT
                SUM(CASE WHEN status = 'PENDING' OR status = 'PROCESSING' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
            FROM tasks
        `).get() as any;

        return {
            pending: stats.pending || 0,
            failed: stats.failed || 0,
            completed: stats.completed || 0
        };
    }

    /**
     * 功能描述：分页查询任务列表或按日期范围查询（日历模式）
     *
     * 参数说明：
     * - page: [number] 页码
     * - pageSize: [number] 每页条数
     * - startDate: [string | undefined] 起始日期（日历模式）
     * - endDate: [string | undefined] 结束日期（日历模式）
     *
     * 返回说明：
     * - { data: any[], pagination: { total, page, pageSize, totalPages } }
     *
     * NOTE: 提供日期范围时进入日历模式（最多 1000 条），否则分页模式
     */
    static listTasks(page: number, pageSize: number, startDate?: string, endDate?: string): { data: any[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } } {
        let tasks: any[];
        let totalCount: number;

        if (startDate && endDate) {
            // 日历模式：查询日期范围内所有任务（按 scheduled_at 或 created_at 筛选）
            tasks = db.prepare(`
                SELECT * FROM tasks
                WHERE (scheduled_at BETWEEN ? AND ?)
                   OR (scheduled_at IS NULL AND created_at BETWEEN ? AND ?)
                ORDER BY created_at DESC
                LIMIT 1000
            `).all(startDate, endDate, startDate, endDate) as any[];
            totalCount = tasks.length;
        } else {
            // 分页模式：查询总数 + 分页数据
            const total = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
            totalCount = total.count;
            const offset = (page - 1) * pageSize;

            tasks = db.prepare(`
                SELECT * FROM tasks
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `).all(pageSize, offset) as any[];
        }

        return {
            data: tasks.map(task => this.parseTask(task)),
            pagination: {
                total: totalCount,
                page,
                pageSize: startDate ? totalCount : pageSize,
                totalPages: startDate ? 1 : Math.ceil(totalCount / pageSize)
            }
        };
    }

    /**
     * 功能描述：更新任务状态、结果和错误信息
     *
     * 参数说明：
     * - id: [number | string] 任务 ID
     * - status: [string] 新状态
     * - result: [any | undefined] 任务结果（将 JSON 序列化存储）
     * - error: [string | undefined] 错误信息
     */
    static updateTaskStatus(id: number | string, status: string, result?: any, error?: string): void {
        db.prepare(`
            UPDATE tasks
            SET status = ?, result = ?, error = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(status, result ? JSON.stringify(result) : null, error || null, id);
    }

    /**
     * 功能描述：解析任务记录的 JSON 字段（payload 和 result）
     *
     * 参数说明：
     * - task: [any] 数据库原始任务记录
     *
     * 返回说明：
     * - any 解析后的任务对象
     *
     * NOTE: 私有工具方法，供内部调用复用
     */
    private static parseTask(task: any): any {
        return {
            ...task,
            payload: JSON.parse(task.payload),
            result: task.result ? JSON.parse(task.result) : undefined
        };
    }
}
