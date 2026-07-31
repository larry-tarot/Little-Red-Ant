import db from '../api/db.js';

console.log('users:', db.prepare('SELECT * FROM users LIMIT 1').all());
console.log('admin_users:', db.prepare('SELECT id, username, role, alias FROM admin_users').all());
console.log('accounts:', db.prepare('SELECT id, alias, is_active, status FROM accounts').all());
console.log('settings keys:', db.prepare('SELECT key FROM settings').all().map((r: any) => r.key));
console.log('competitors:', db.prepare(`
    SELECT id, user_id, nickname, status, fans_count, notes_count, likes_count, last_error, last_updated
    FROM competitors
    ORDER BY last_updated DESC
`).all());
