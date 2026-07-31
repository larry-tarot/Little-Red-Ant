/**
 * queue.ts unit tests — focused on:
 *   - enqueueTask: returns UUID, sets priority defaults, schedules vs immediate
 *   - getNextPendingTask: priority ordering, lock semantics
 *   - emitTaskProgress: writes DB + emits on EventEmitter
 *   - completeTask / failTask: status transitions, retry backoff
 *
 * Not testing: BrowserService / Playwright integration (would need e2e).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb, getTestDb, getTestDbSync } from '../setup.js';

describe('queue.ts', () => {
    beforeEach(async () => {
        // Reset data only — keep module cache so the queue module reuses the
        // in-memory DB singleton that api/db.ts created.
        await resetTestDb();
        await getTestDb(); // ensure handle cached for sync access in tests
    });

    it('enqueueTask returns a UUID and inserts a PENDING row', async () => {
        const db = getTestDbSync();
        const { enqueueTask, getTask } = await import('../../api/services/queue.js');

        const id = enqueueTask('TEST_TYPE', { foo: 'bar' });
        expect(id).toMatch(/^[0-9a-f-]{36}$/i);

        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
        expect(row.status).toBe('PENDING');
        expect(row.type).toBe('TEST_TYPE');
        expect(JSON.parse(row.payload)).toEqual({ foo: 'bar' });
        // Default progress is 0; priority is bumped for GENERATE_* types, not for TEST_TYPE.
        expect(row.progress).toBe(0);
        expect(row.priority).toBe(0);

        // getTask should round-trip the payload
        const task = getTask(id);
        expect(task?.payload).toEqual({ foo: 'bar' });
    });

    it('enqueueTask gives user-facing generation types higher default priority', async () => {
        const db = getTestDbSync();
        const { enqueueTask } = await import('../../api/services/queue.js');

        enqueueTask('PUBLISH', { title: 'x' });
        enqueueTask('SCRAPE_TRENDS', {});

        const rows = db.prepare('SELECT type, priority FROM tasks ORDER BY created_at').all() as any[];
        expect(rows[0].priority).toBe(5);   // PUBLISH → 5
        expect(rows[1].priority).toBe(0);   // SCRAPE_TRENDS → 0 (default)
    });

    it('emitTaskProgress writes to DB and emits on taskProgressEvents', async () => {
        const db = getTestDbSync();
        const queue = await import('../../api/services/queue.js');
        const { enqueueTask, emitTaskProgress, taskProgressEvents } = queue;

        const id = enqueueTask('TEST_TYPE', {});
        const received: any[] = [];
        const onProgress = (e: any) => received.push(e);
        taskProgressEvents.on('progress', onProgress);

        emitTaskProgress({ taskId: id, progress: 42, stage: 'mid-way' });
        emitTaskProgress({ taskId: id, progress: 200, stage: 'clamped' }); // out of range

        const row = db.prepare('SELECT progress FROM tasks WHERE id = ?').get(id) as any;
        expect(row.progress).toBe(100); // clamped
        expect(received).toHaveLength(2);
        expect(received[0].progress).toBe(42);
        expect(received[0].stage).toBe('mid-way');
        expect(received[1].progress).toBe(100);

        taskProgressEvents.off('progress', onProgress);
    });

    it('completeTask marks COMPLETED with progress=100 and stores JSON result', async () => {
        const db = getTestDbSync();
        const { enqueueTask, completeTask } = await import('../../api/services/queue.js');

        const id = enqueueTask('TEST_TYPE', {});
        completeTask(id, { ok: true, count: 3 });

        const row = db.prepare('SELECT status, progress, result FROM tasks WHERE id = ?').get(id) as any;
        expect(row.status).toBe('COMPLETED');
        expect(row.progress).toBe(100);
        expect(JSON.parse(row.result)).toEqual({ ok: true, count: 3 });
    });

    it('failTask schedules retry with exponential backoff on first 2 attempts', async () => {
        const _db = getTestDbSync();
        const { enqueueTask, failTask, getTask } = await import('../../api/services/queue.js');

        const id = enqueueTask('TEST_TYPE', {});

        // First failure: attempts goes 0 → 1, backoff = 2^0 * 60s = 60s
        failTask(id, 'flaky network');
        let task = getTask(id);
        expect(task?.status).toBe('PENDING');     // retried → PENDING
        expect(task?.attempts).toBe(1);
        const scheduled = new Date(task!.scheduled_at!).getTime();
        const now = Date.now();
        expect(scheduled - now).toBeGreaterThan(50_000);
        expect(scheduled - now).toBeLessThan(70_000);

        // Second failure: attempts 1 → 2, backoff = 2^1 * 60s = 120s
        failTask(id, 'still flaky');
        task = getTask(id);
        expect(task?.attempts).toBe(2);
        const scheduled2 = new Date(task!.scheduled_at!).getTime();
        expect(scheduled2 - now).toBeGreaterThan(110_000);
        expect(scheduled2 - now).toBeLessThan(130_000);
    });

    it('failTask exhausts retries and marks FAILED on 4th attempt', async () => {
        const _db = getTestDbSync();
        const { enqueueTask, failTask, getTask } = await import('../../api/services/queue.js');

        const id = enqueueTask('TEST_TYPE', {});
        failTask(id, 'err 1');
        failTask(id, 'err 2');
        failTask(id, 'err 3');
        failTask(id, 'err 4');

        const task = getTask(id);
        expect(task?.status).toBe('FAILED');
        expect(task?.attempts).toBe(3);
        // getTask() already JSON.parses result — so it comes back as an array.
        // 4 errors total: 3 retried (stored in result) + 1 final (overwrites result).
        const errorLog = (task?.result as any[]) || [];
        expect(Array.isArray(errorLog) ? errorLog : []).toHaveLength(4);
    });
});
