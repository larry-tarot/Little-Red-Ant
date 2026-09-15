import { describe, expect, it } from 'vitest';
import { PublishSchema } from '../../shared/schemas/index.js';
import { BatchPublishSchema } from '../../api/routes/publish.js';

const validBatchPayload = {
    title: '测试标题',
    content: '测试正文',
    imageData: ['data:image/png;base64,abc'],
    accountIds: [1],
};

const validPayload = {
    title: '测试标题',
    content: '测试正文',
    imageData: ['data:image/png;base64,abc'],
    accountId: 1,
};

describe('PublishSchema', () => {
    it('rejects a publish request without explicit human confirmation', () => {
        const result = PublishSchema.safeParse(validPayload);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(issue => issue.path.includes('confirmedByUser'))).toBe(true);
        }
    });

    it('accepts a publish request only when human confirmation is true', () => {
        const result = PublishSchema.safeParse({ ...validPayload, confirmedByUser: true });

        expect(result.success).toBe(true);
    });

    it('rejects batch publish requests without one explicit confirmation', () => {
        const result = BatchPublishSchema.safeParse(validBatchPayload);

        expect(result.success).toBe(false);
    });

    it('accepts batch publish requests with one explicit confirmation', () => {
        const result = BatchPublishSchema.safeParse({ ...validBatchPayload, confirmedByUser: true });

        expect(result.success).toBe(true);
    });
});
