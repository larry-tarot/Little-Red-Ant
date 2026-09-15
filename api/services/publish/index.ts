import { createHash } from 'node:crypto';

export type PublishStatus =
    | 'confirmed'
    | 'submitted_unconfirmed'
    | 'captcha_blocked'
    | 'failed'
    | 'blocked';

export type PublishBlockReason =
    | 'confirmation_required'
    | 'preflight_failed'
    | 'account_busy';

export interface SafePublishRequest {
    accountId: string;
    draftVersionId: string;
    title: string;
    content: string;
    mediaPaths: string[];
    confirmedByUser: boolean;
}

export interface PublishResult {
    status: PublishStatus;
    retryable: boolean;
    reason?: PublishBlockReason;
    evidence?: {
        noteId?: string;
        noteUrl?: string;
    };
}

export interface PublishAdapter {
    publish(request: SafePublishRequest): Promise<Pick<PublishResult, 'status' | 'evidence'>>;
}

export interface AccountLock {
    tryAcquire(accountId: string): boolean;
    release(accountId: string): void;
}

export class InMemoryAccountLock implements AccountLock {
    private readonly lockedAccounts = new Set<string>();

    tryAcquire(accountId: string): boolean {
        if (this.lockedAccounts.has(accountId)) {
            return false;
        }
        this.lockedAccounts.add(accountId);
        return true;
    }

    release(accountId: string): void {
        this.lockedAccounts.delete(accountId);
    }
}

export interface IdempotencyStore {
    get(key: string): PublishResult | undefined;
    set(key: string, result: PublishResult): void;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
    private readonly records = new Map<string, PublishResult>();

    get(key: string): PublishResult | undefined {
        return this.records.get(key);
    }

    set(key: string, result: PublishResult): void {
        this.records.set(key, result);
    }
}

export interface SafePublishOptions {
    blockedPhrases?: string[];
    accountLock?: AccountLock;
    idempotencyStore?: IdempotencyStore;
}

export class SafePublishOrchestrator {
    private readonly blockedPhrases: string[];
    private readonly accountLock: AccountLock;
    private readonly idempotencyStore: IdempotencyStore;

    constructor(
        private readonly adapter: PublishAdapter,
        options: SafePublishOptions = {},
    ) {
        this.blockedPhrases = options.blockedPhrases ?? [];
        this.accountLock = options.accountLock ?? new InMemoryAccountLock();
        this.idempotencyStore = options.idempotencyStore ?? new InMemoryIdempotencyStore();
    }

    async publish(request: SafePublishRequest): Promise<PublishResult> {
        const preflight = this.preflight(request);
        if (preflight) {
            return preflight;
        }

        const idempotencyKey = this.createIdempotencyKey(request);
        const previous = this.idempotencyStore.get(idempotencyKey);
        if (previous) {
            return previous;
        }

        if (!this.accountLock.tryAcquire(request.accountId)) {
            return this.block('account_busy');
        }

        try {
            const adapterResult = await this.adapter.publish(request);
            const result = this.normalizeAdapterResult(adapterResult);
            this.idempotencyStore.set(idempotencyKey, result);
            return result;
        } catch {
            const result: PublishResult = { status: 'failed', retryable: false };
            this.idempotencyStore.set(idempotencyKey, result);
            return result;
        } finally {
            this.accountLock.release(request.accountId);
        }
    }

    private preflight(request: SafePublishRequest): PublishResult | undefined {
        if (!request.confirmedByUser) {
            return this.block('confirmation_required');
        }

        if (!request.title.trim() || !request.content.trim() || request.mediaPaths.length === 0) {
            return this.block('preflight_failed');
        }

        const candidateText = `${request.title}\n${request.content}`;
        if (this.blockedPhrases.some(phrase => phrase && candidateText.includes(phrase))) {
            return this.block('preflight_failed');
        }

        return undefined;
    }

    private normalizeAdapterResult(
        result: Pick<PublishResult, 'status' | 'evidence'>,
    ): PublishResult {
        switch (result.status) {
            case 'confirmed':
                return { status: 'confirmed', retryable: false, evidence: result.evidence };
            case 'submitted_unconfirmed':
                return { status: 'submitted_unconfirmed', retryable: false, evidence: result.evidence };
            case 'captcha_blocked':
                return { status: 'captcha_blocked', retryable: false, evidence: result.evidence };
            default:
                return { status: 'failed', retryable: false, evidence: result.evidence };
        }
    }

    private block(reason: PublishBlockReason): PublishResult {
        return { status: 'blocked', reason, retryable: false };
    }

    private createIdempotencyKey(request: SafePublishRequest): string {
        const normalized = JSON.stringify({
            accountId: request.accountId,
            draftVersionId: request.draftVersionId,
            title: request.title,
            content: request.content,
            mediaPaths: request.mediaPaths,
        });
        return createHash('sha256').update(normalized).digest('hex');
    }
}
