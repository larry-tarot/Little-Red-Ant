import db from '../api/db.js';

// 将长时间处于 processing 状态的任务重置为 pending，以便重新执行
const result = db.prepare(`
    UPDATE tasks
    SET status = 'PENDING', attempts = 0, progress = 0, error = NULL, scheduled_at = NULL, updated_at = ?
    WHERE status = 'PROCESSING' AND updated_at < datetime('now', '-10 minutes')
`).run(new Date().toISOString());

console.log(`Reset ${result.changes} stale processing tasks to PENDING`);
