import { describe, expect, it } from 'vitest';
import {
    InMemoryAccountLock,
    InMemoryIdempotencyStore,
    SafePublishOrchestrator,
    type PublishAdapter,
    type SafePublishRequest,
} from '../../api/services/publish/index.js';

class FakePublishAdapter implements PublishAdapter {
    calls: SafePublishRequest[] = [];

    constructor(private readonly result: 'confirmed' | 'submitted_unconfirmed' | 'captcha_blocked' = 'confirmed') {}

    async publish(request: SafePublishRequest) {
        this.calls.push(request);
        return {
            status: this.result,
            evidence: this.result === 'confirmed' ? { noteId: 'note-1' } : undefined,
        };
    }
}

function request(overrides: Partial<SafePublishRequest> = {}): SafePublishRequest {
    return {
        accountId: 'account-1',
        draftVersionId: 'draft-v1',
        title: '测试标题',
        content: '这是一篇待发布的测试笔记。',
        mediaPaths: ['C:/media/cover.png'],
        confirmedByUser: true,
        ...overrides,
    };
}

describe('SafePublishOrchestrator', () => {
    it('blocks a request that was not explicitly confirmed without invoking the adapter', async () => {
        const adapter = new FakePublishAdapter();
        const orchestrator = new SafePublishOrchestrator(adapter);

        const result = await orchestrator.publish(request({ confirmedByUser: false }));

        expect(result).toMatchObject({ status: 'blocked', reason: 'confirmation_required' });
        expect(adapter.calls).toHaveLength(0);
    });

    it('blocks a request with a configured risk phrase without invoking the adapter', async () => {
        const adapter = new FakePublishAdapter();
        const orchestrator = new SafePublishOrchestrator(adapter, {
            blockedPhrases: ['夸大承诺'],
        });

        const result = await orchestrator.publish(request({ content: '这是夸大承诺的内容。' }));

        expect(result).toMatchObject({ status: 'blocked', reason: 'preflight_failed' });
        expect(adapter.calls).toHaveLength(0);
    });

    it('returns the original result for an identical confirmed request without publishing twice', async () => {
        const adapter = new FakePublishAdapter('confirmed');
        const orchestrator = new SafePublishOrchestrator(adapter);
        const publishRequest = request();

        const first = await orchestrator.publish(publishRequest);
        const second = await orchestrator.publish(publishRequest);

        expect(first).toMatchObject({ status: 'confirmed' });
        expect(second).toEqual(first);
        expect(adapter.calls).toHaveLength(1);
    });

    it('records an unknown submitted result and refuses to replay it automatically', async () => {
        const adapter = new FakePublishAdapter('submitted_unconfirmed');
        const orchestrator = new SafePublishOrchestrator(adapter);
        const publishRequest = request();

        const first = await orchestrator.publish(publishRequest);
        const second = await orchestrator.publish(publishRequest);

        expect(first).toMatchObject({ status: 'submitted_unconfirmed' });
        expect(second).toEqual(first);
        expect(adapter.calls).toHaveLength(1);
    });

    it('blocks a concurrent request for the same account while a publish is in progress', async () => {
        let releaseFirstPublish!: () => void;
        const adapter: PublishAdapter = {
            publish: () => new Promise(resolve => {
                releaseFirstPublish = () => resolve({ status: 'confirmed' });
            }),
        };
        const orchestrator = new SafePublishOrchestrator(adapter, {
            accountLock: new InMemoryAccountLock(),
            idempotencyStore: new InMemoryIdempotencyStore(),
        });

        const firstPublish = orchestrator.publish(request());
        await Promise.resolve();
        const second = await orchestrator.publish(request({ draftVersionId: 'draft-v2' }));
        releaseFirstPublish();
        await firstPublish;

        expect(second).toMatchObject({ status: 'blocked', reason: 'account_busy' });
    });

    it('returns captcha_blocked and does not classify it as retryable', async () => {
        const adapter = new FakePublishAdapter('captcha_blocked');
        const orchestrator = new SafePublishOrchestrator(adapter);

        const result = await orchestrator.publish(request());

        expect(result).toMatchObject({ status: 'captcha_blocked', retryable: false });
    });
});
