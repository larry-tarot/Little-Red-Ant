/**
 * PublishHandler unit tests — focused on the P0 closed-loop writeback.
 *
 * This is the most important test: it guards against the regression where
 * publishing a note leaves drafts.published_note_id and note_stats.draft_id
 * unconnected, breaking analytics attribution.
 *
 * Strategy: import the real PublishHandler and rpa/publish, then override
 * the openPublishPageWithContent function on the rpa/publish module via
 * Object.defineProperty (ESM named exports are read-only getters, so direct
 * assignment fails; defineProperty succeeds and the override is visible to
 * PublishHandler because both import the same module instance).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { resetTestDb, getTestDb, getTestDbSync } from '../setup.js';

describe('PublishHandler — closed-loop writeback', () => {
    let rpaPublish: any;

    beforeAll(async () => {
        // Import rpa/publish ONCE at the describe scope so all tests share the
        // same module namespace (and the same defineProperty overrides).
        rpaPublish = await import('../../api/services/rpa/publish.js');
    });

    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
    });

    function setupAccountAndDraft() {
        const db = getTestDbSync();
        db.prepare(`INSERT INTO accounts (id, nickname, is_active) VALUES (1, '测试账号', 1)`).run();
        db.prepare(`INSERT INTO drafts (id, title, content, published_note_id) VALUES (42, '草稿标题', '草稿内容', NULL)`).run();
    }

    function stubRpaPublishReturning(noteId: string | undefined) {
        Object.defineProperty(rpaPublish, 'openPublishPageWithContent', {
            configurable: true,
            writable: true,
            value: vi.fn().mockResolvedValue({
                success: !!noteId,
                noteId,
                noteUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined,
            }),
        });
    }

    function stubRpaPublishToReturnUndefined() {
        // Simulate the "browser closed / no result" path that publish.ts:467
        // handles in production. PublishHandler must guard against undefined.
        Object.defineProperty(rpaPublish, 'openPublishPageWithContent', {
            configurable: true,
            writable: true,
            value: vi.fn().mockResolvedValue(undefined),
        });
    }

    it('writes note_stats.draft_id on successful publish (P0 writeback)', async () => {
        const db = getTestDbSync();
        setupAccountAndDraft();
        stubRpaPublishReturning('fake-note-1');

        const { PublishHandler } = await import('../../api/services/tasks/handlers/PublishHandler.js');
        const handler = new PublishHandler();
        const result = await handler.handle({
            id: 'task-1',
            type: 'PUBLISH',
            payload: {
                title: '草稿标题',
                content: '草稿内容',
                tags: ['测试'],
                accountId: 1,
                draftId: 42,
                autoPublish: true,
                confirmedByUser: true,
            },
        });

        expect(result.success).toBe(true);
        expect(result.noteId).toBe('fake-note-1');

        // 1) drafts.published_note_id should be set
        const draft = db.prepare('SELECT published_note_id, published_url FROM drafts WHERE id = 42').get() as any;
        expect(draft.published_note_id).toBe('fake-note-1');
        expect(draft.published_url).toBe('https://www.xiaohongshu.com/explore/fake-note-1');

        // 2) note_stats.draft_id should be 42 — the closed loop
        const stat = db.prepare('SELECT draft_id, account_id, note_id FROM note_stats WHERE note_id = ?').get('fake-note-1') as any;
        expect(stat).toBeDefined();
        expect(stat.draft_id).toBe(42);
        expect(stat.account_id).toBe(1);

        // 3) note_stats_history should have a seed row for trend charts
        const history = db.prepare('SELECT note_id FROM note_stats_history WHERE note_id = ?').get('fake-note-1');
        expect(history).toBeDefined();
    });

    it('idempotent re-publish updates draft_id instead of duplicating note_stats', async () => {
        const db = getTestDbSync();
        setupAccountAndDraft();
        // Pre-seed a note_stats row for the same noteId (simulating a prior scrape).
        db.prepare(`INSERT INTO note_stats (note_id, draft_id, account_id) VALUES ('fake-note-1', NULL, 1)`).run();
        stubRpaPublishReturning('fake-note-1');

        const { PublishHandler } = await import('../../api/services/tasks/handlers/PublishHandler.js');
        await new PublishHandler().handle({
            id: 'task-2',
            type: 'PUBLISH',
            payload: { title: 't', content: 'c', tags: [], accountId: 1, draftId: 42, autoPublish: true, confirmedByUser: true },
        });

        // Should have updated, not inserted
        const rows = db.prepare('SELECT id, draft_id FROM note_stats WHERE note_id = ?').all('fake-note-1') as any[];
        expect(rows).toHaveLength(1);
        expect(rows[0].draft_id).toBe(42);
    });

    it('does not write note_stats when noteId is missing from result', async () => {
        const db = getTestDbSync();
        setupAccountAndDraft();
        stubRpaPublishReturning(undefined);

        const { PublishHandler } = await import('../../api/services/tasks/handlers/PublishHandler.js');
        const result = await new PublishHandler().handle({
            id: 'task-3',
            type: 'PUBLISH',
            payload: { title: 't', content: 'c', tags: [], accountId: 1, draftId: 42, autoPublish: true, confirmedByUser: true },
        });

        const draft = db.prepare('SELECT published_note_id FROM drafts WHERE id = 42').get() as any;
        expect(draft.published_note_id).toBeNull();

        const stat = db.prepare('SELECT id FROM note_stats WHERE draft_id = 42').get();
        expect(stat).toBeUndefined();
        return result;
    });

    it('blocks a task lacking explicit publish confirmation before invoking RPA', async () => {
        const db = getTestDbSync();
        setupAccountAndDraft();
        const rpaSpy = vi.fn().mockResolvedValue({ success: true, noteId: 'must-not-publish' });
        Object.defineProperty(rpaPublish, 'openPublishPageWithContent', {
            configurable: true,
            writable: true,
            value: rpaSpy,
        });

        const { PublishHandler } = await import('../../api/services/tasks/handlers/PublishHandler.js');
        await expect(new PublishHandler().handle({
            id: 'task-unconfirmed',
            type: 'PUBLISH',
            payload: {
                title: '草稿标题',
                content: '草稿内容',
                tags: [],
                accountId: 1,
                draftId: 42,
                autoPublish: true,
                confirmedByUser: false,
            },
        })).rejects.toThrow(/explicit user confirmation/i);

        expect(rpaSpy).not.toHaveBeenCalled();
    });

    it('returns the first confirmed result instead of invoking RPA again for an identical publish', async () => {
        const db = getTestDbSync();
        setupAccountAndDraft();
        const rpaSpy = vi.fn().mockResolvedValue({
            success: true,
            noteId: 'deduplicated-note',
            noteUrl: 'https://www.xiaohongshu.com/explore/deduplicated-note',
        });
        Object.defineProperty(rpaPublish, 'openPublishPageWithContent', {
            configurable: true,
            writable: true,
            value: rpaSpy,
        });
        const { PublishHandler } = await import('../../api/services/tasks/handlers/PublishHandler.js');
        const payload = {
            title: '同一篇草稿', content: '同一篇正文', tags: [], accountId: 1,
            draftId: 42, autoPublish: true, confirmedByUser: true,
        };

        const first = await new PublishHandler().handle({ id: 'task-dedupe-1', type: 'PUBLISH', payload });
        const second = await new PublishHandler().handle({ id: 'task-dedupe-2', type: 'PUBLISH', payload });

        expect(first).toMatchObject({ success: true, noteId: 'deduplicated-note' });
        expect(second).toMatchObject({ success: true, noteId: 'deduplicated-note', deduplicated: true });
        expect(rpaSpy).toHaveBeenCalledTimes(1);
    });

    it('releases a failed publish claim so a later retry can execute once the browser error clears', async () => {
        const db = getTestDbSync();
        setupAccountAndDraft();
        const rpaSpy = vi.fn()
            .mockRejectedValueOnce(new Error('temporary browser failure'))
            .mockResolvedValueOnce({ success: true, noteId: 'retry-note' });
        Object.defineProperty(rpaPublish, 'openPublishPageWithContent', {
            configurable: true,
            writable: true,
            value: rpaSpy,
        });
        const { PublishHandler } = await import('../../api/services/tasks/handlers/PublishHandler.js');
        const payload = {
            title: '可重试草稿', content: '浏览器错误恢复后应允许再试。', tags: [], accountId: 1,
            draftId: 42, autoPublish: true, confirmedByUser: true,
        };

        await expect(new PublishHandler().handle({ id: 'task-retry-1', type: 'PUBLISH', payload })).rejects.toThrow('temporary browser failure');
        const retry = await new PublishHandler().handle({ id: 'task-retry-2', type: 'PUBLISH', payload });

        expect(retry).toMatchObject({ success: true, noteId: 'retry-note' });
        expect(rpaSpy).toHaveBeenCalledTimes(2);
    });

    it('blocks publish when compliance BLOCK keyword matches', async () => {
        const db = getTestDbSync();
        setupAccountAndDraft();
        db.prepare(`INSERT INTO compliance_rules (category, keyword, level, suggestion) VALUES ('forbidden', '违规词', 'BLOCK', '请删除')`).run();
        // Compliance short-circuits before RPA, but stub it anyway as a safety net
        // so the test never accidentally invokes a real browser.
        stubRpaPublishToReturnUndefined();

        const { PublishHandler } = await import('../../api/services/tasks/handlers/PublishHandler.js');
        await expect(new PublishHandler().handle({
            id: 'task-4',
            type: 'PUBLISH',
            payload: {
                title: '正常标题',
                content: '包含违规词的内容',
                tags: [],
                accountId: 1,
                draftId: 42,
                autoPublish: true,
                confirmedByUser: true,
            },
        })).rejects.toThrow(/blocked by Compliance/);
    });
});
