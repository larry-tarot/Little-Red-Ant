import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, resetTestDb } from '../setup.js';

describe('PersistentPublishGuard', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
    });

    it('acquires a durable claim for a new account and content identity', async () => {
        const { PersistentPublishGuard } = await import('../../api/services/publish/PersistentPublishGuard.js');
        const guard = new PersistentPublishGuard();

        const claim = guard.claim({
            accountId: 1,
            draftVersionId: 'draft-42-v1',
            contentHash: 'hash-a',
            taskId: 'task-1',
        });

        expect(claim).toEqual({ kind: 'acquired', attemptId: expect.any(String) });
    });

    it('returns the prior non-final submission instead of allowing a blind replay', async () => {
        const { PersistentPublishGuard } = await import('../../api/services/publish/PersistentPublishGuard.js');
        const guard = new PersistentPublishGuard();
        const request = { accountId: 1, draftVersionId: 'draft-42-v1', contentHash: 'hash-a', taskId: 'task-1' };
        const first = guard.claim(request);
        if (first.kind !== 'acquired') throw new Error('expected first claim');
        guard.recordOutcome(first.attemptId, 'submitted_unconfirmed');

        const replay = guard.claim({ ...request, taskId: 'task-2' });

        expect(replay).toEqual({ kind: 'existing', status: 'submitted_unconfirmed' });
    });

    it('blocks another content identity while the same account has a processing claim', async () => {
        const { PersistentPublishGuard } = await import('../../api/services/publish/PersistentPublishGuard.js');
        const guard = new PersistentPublishGuard();
        const first = guard.claim({ accountId: 1, draftVersionId: 'draft-1', contentHash: 'hash-a', taskId: 'task-1' });
        expect(first.kind).toBe('acquired');

        const second = guard.claim({ accountId: 1, draftVersionId: 'draft-2', contentHash: 'hash-b', taskId: 'task-2' });

        expect(second).toEqual({ kind: 'account_busy' });
    });

    it('allows a different content identity after the first claim reaches a final confirmed state', async () => {
        const { PersistentPublishGuard } = await import('../../api/services/publish/PersistentPublishGuard.js');
        const guard = new PersistentPublishGuard();
        const first = guard.claim({ accountId: 1, draftVersionId: 'draft-1', contentHash: 'hash-a', taskId: 'task-1' });
        if (first.kind !== 'acquired') throw new Error('expected first claim');
        guard.recordOutcome(first.attemptId, 'confirmed');

        const second = guard.claim({ accountId: 1, draftVersionId: 'draft-2', contentHash: 'hash-b', taskId: 'task-2' });

        expect(second).toEqual({ kind: 'acquired', attemptId: expect.any(String) });
    });
});
