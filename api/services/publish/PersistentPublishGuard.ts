import crypto from 'node:crypto';
import db from '../../db.js';

export type DurablePublishStatus =
    | 'processing'
    | 'confirmed'
    | 'submitted_unconfirmed'
    | 'captcha_blocked'
    | 'failed';

export interface PublishClaimRequest {
    accountId: number;
    draftVersionId: string;
    contentHash: string;
    taskId: string;
}

export type PublishClaim =
    | { kind: 'acquired'; attemptId: string }
    | { kind: 'existing'; status: DurablePublishStatus; result?: unknown }
    | { kind: 'account_busy' };

const TERMINAL_STATUSES = new Set<DurablePublishStatus>(['confirmed', 'failed']);

/**
 * Persists the publication decision boundary. It intentionally treats unknown
 * and CAPTCHA outcomes as non-replayable: a person must review before any new
 * request is created.
 */
export class PersistentPublishGuard {
    claim(request: PublishClaimRequest): PublishClaim {
        const idempotencyKey = this.createKey(request);
        const now = new Date().toISOString();
        let claim: PublishClaim | undefined;

        const transaction = db.transaction(() => {
            const existing = db.prepare(`
                SELECT id, status, result FROM publish_attempts WHERE idempotency_key = ?
            `).get(idempotencyKey) as { id: string; status: DurablePublishStatus; result: string | null } | undefined;
            if (existing) {
                claim = {
                    kind: 'existing',
                    status: existing.status,
                    result: existing.result ? this.parseResult(existing.result) : undefined,
                };
                return;
            }

            const activeForAccount = db.prepare(`
                SELECT id FROM publish_attempts
                WHERE account_id = ? AND status = 'processing'
                LIMIT 1
            `).get(request.accountId);
            if (activeForAccount) {
                claim = { kind: 'account_busy' };
                return;
            }

            const attemptId = crypto.randomUUID();
            db.prepare(`
                INSERT INTO publish_attempts
                    (id, account_id, idempotency_key, task_id, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'processing', ?, ?)
            `).run(attemptId, request.accountId, idempotencyKey, request.taskId, now, now);
            claim = { kind: 'acquired', attemptId };
        });
        (transaction as any).immediate();

        return claim!;
    }

    recordOutcome(
        attemptId: string,
        status: Exclude<DurablePublishStatus, 'processing'>,
        result?: unknown,
    ): void {
        db.prepare(`
            UPDATE publish_attempts
            SET status = ?, result = ?, updated_at = ?
            WHERE id = ?
        `).run(status, result === undefined ? null : JSON.stringify(result), new Date().toISOString(), attemptId);
    }

    releaseForRetry(attemptId: string): void {
        const record = db.prepare('SELECT status FROM publish_attempts WHERE id = ?').get(attemptId) as { status: DurablePublishStatus } | undefined;
        if (!record || !TERMINAL_STATUSES.has(record.status)) {
            return;
        }
        db.prepare('DELETE FROM publish_attempts WHERE id = ?').run(attemptId);
    }

    private createKey(request: PublishClaimRequest): string {
        return crypto.createHash('sha256').update(JSON.stringify({
            accountId: request.accountId,
            draftVersionId: request.draftVersionId,
            contentHash: request.contentHash,
        })).digest('hex');
    }

    private parseResult(raw: string): unknown {
        try {
            return JSON.parse(raw);
        } catch {
            return undefined;
        }
    }
}
