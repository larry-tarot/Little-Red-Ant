import db from '../api/db.js';

const rows = db.prepare(`
    SELECT id, user_id, nickname, fans_count, notes_count, likes_count, status, last_error,
           length(latest_notes) as notes_json_len, last_updated
    FROM competitors
    ORDER BY last_updated DESC
    LIMIT 10
`).all();

for (const row of rows as any[]) {
    console.log(
        `[${row.id}] ${row.nickname || '(no name)'} (${row.user_id}): ` +
        `fans=${row.fans_count}, notes=${row.notes_count}, likes=${row.likes_count}, ` +
        `status=${row.status}, updated=${row.last_updated}, ` +
        `error=${row.last_error || 'none'}, json_len=${row.notes_json_len}`
    );
}
