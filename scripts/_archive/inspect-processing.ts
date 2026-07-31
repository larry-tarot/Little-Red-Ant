import db from '../api/db.js';

const rows = db.prepare(`
    SELECT id, type, status, progress, updated_at, created_at
    FROM tasks
    WHERE status = 'PROCESSING'
`).all();

console.log(JSON.stringify(rows, null, 2));
