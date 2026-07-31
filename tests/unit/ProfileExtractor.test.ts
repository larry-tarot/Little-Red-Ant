import { describe, it, expect } from 'vitest';
import { parseProfileMetrics } from '../../api/services/scraper/utils/ProfileExtractor.js';

describe('ProfileExtractor', () => {
    describe('parseProfileMetrics', () => {
        it('parses direct number fields', () => {
            const result = parseProfileMetrics({
                nickname: 'Test',
                fans: 12500,
                note_count: 256,
                likes_count: 89000
            });
            expect(result.fans_count).toBe(12500);
            expect(result.notes_count).toBe(256);
            expect(result.likes_count).toBe(89000);
        });

        it('parses string fields with 万', () => {
            const result = parseProfileMetrics({
                fans_number: '1.2万',
                total_notes: '85',
                total_liked: '3.5万'
            });
            expect(result.fans_count).toBe(12000);
            expect(result.notes_count).toBe(85);
            expect(result.likes_count).toBe(35000);
        });

        it('parses interactions array', () => {
            const result = parseProfileMetrics({
                interactions: [
                    { name: '粉丝', count: '10万' },
                    { name: '笔记', count: '128' },
                    { name: '获赞与收藏', count: '50万' }
                ]
            });
            expect(result.fans_count).toBe(100000);
            expect(result.notes_count).toBe(128);
            expect(result.likes_count).toBe(500000);
        });

        it('returns 0 for missing data', () => {
            const result = parseProfileMetrics(null);
            expect(result.fans_count).toBe(0);
            expect(result.notes_count).toBe(0);
            expect(result.likes_count).toBe(0);
        });
    });
});
