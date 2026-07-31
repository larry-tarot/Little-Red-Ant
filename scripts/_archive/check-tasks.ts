import db from '../api/db.js';

console.log('=== Recent failed/cancelled tasks ===');
const failedTasks = db.prepare(`
    SELECT id, type, status, error, attempts, progress, created_at, updated_at
    FROM tasks
    WHERE status IN ('FAILED', 'CANCELLED') OR (status = 'PROCESSING' AND updated_at < datetime('now', '-5 minutes'))
    ORDER BY updated_at DESC
    LIMIT 20
`).all();

for (const task of failedTasks as any[]) {
    console.log(`[${task.id}] ${task.type} status=${task.status} attempts=${task.attempts} progress=${task.progress}`);
    console.log(`  error: ${task.error || 'none'}`);
    console.log(`  created: ${task.created_at}, updated: ${task.updated_at}`);
}

console.log('\n=== Currently processing tasks ===');
const processing = db.prepare(`
    SELECT id, type, status, progress, updated_at
    FROM tasks
    WHERE status = 'PROCESSING'
    ORDER BY updated_at DESC
`).all();

for (const task of processing as any[]) {
    console.log(`[${task.id}] ${task.type} progress=${task.progress} updated=${task.updated_at}`);
}
