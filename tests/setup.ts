// Signal to api/db.ts that we're in test mode BEFORE any consumer imports it.
// Vitest setupFiles run before test files, so this env var is visible by the
// time any `import db from '../api/db.js'` resolves.
process.env.LITTLE_RED_ANT_TEST = '1';

let _testDbHandle: any | null = null;

/**
 * Lazy-load api/db.ts — its top-level code runs once and returns the
 * singleton in-memory DB we want to share with all tests.
 */
export async function getTestDb(): Promise<any> {
    if (_testDbHandle) return _testDbHandle;
    const mod = await import('../api/db.js');
    _testDbHandle = mod.default as any;
    return _testDbHandle;
}

/**
 * Synchronous variant — only valid AFTER getTestDb() has resolved at least once
 * in the current process. We cache the resolved handle so the rest of the test
 * file (which is sync code) can use it without re-importing.
 */
export function getTestDbSync(): any {
    if (_testDbHandle) return _testDbHandle;
    throw new Error('getTestDbSync() called before getTestDb() — call await getTestDb() in beforeEach first.');
}

/**
 * Wipe all known tables. Don't close the connection — closing it would
 * invalidate any module that already imported the singleton.
 */
export async function resetTestDb() {
    const db = await getTestDb();
    // Truncate each known table. The full list comes from api/db.ts:initDB().
    // We DELETE rather than DROP+CREATE so we don't have to re-run initDB().
    for (const t of [
        'publish_attempts', 'tasks', 'note_stats', 'note_stats_history',
        'accounts', 'drafts', 'compliance_rules',
        'prompt_templates', 'notifications',
        'competitor_notes', 'competitors', 'trending_notes',
        'rpa_selectors', 'video_scenes', 'video_projects',
        'admin_users', 'users', 'assets',
        'prompt_optimizations', 'competitor_stats_history',
        'settings', 'trends',
    ]) {
        try { db.exec(`DELETE FROM ${t};`); } catch { /* table not yet created */ }
    }
}
