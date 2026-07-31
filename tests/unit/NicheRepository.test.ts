/**
 * NicheRepository unit tests — demonstrates the Drizzle migration approach
 * by seeding in-memory data and asserting query results.
 *
 * These tests use a different strategy than queue/Compliance tests:
 * we don't mock api/db.js — we just import the drizzle client directly
 * and let it use the same in-memory DB that api/db.ts configured for tests.
 *
 * If the Drizzle path produces results identical to (or supersets of)
 * the legacy NicheService, we can safely migrate the route handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb, getTestDb, getTestDbSync } from '../setup.js';
import { getOrmDb } from '../../api/db/client.js';

describe('NicheRepository (Drizzle migration POC)', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb();
        // Prime the Drizzle client so it shares the same in-memory DB handle
        // that api/db.ts created. Without this, Drizzle opens its own :memory:
        // connection and the seed data (inserted via getTestDbSync) is invisible.
        await getOrmDb();
    });

    function seedTrendingNote(overrides: {
        noteId: string;
        searchKeyword?: string;
        title?: string;
        type?: 'video' | 'image';
        likesCount?: number;
        collectsCount?: number;
        commentsCount?: number;
        topicTags?: string;
        analysisResult?: string | null;
    }) {
        const db = getTestDbSync();
        db.prepare(`
            INSERT INTO trending_notes (
                platform, note_id, title, author_name, note_url,
                likes_count, collects_count, comments_count,
                type, tags, topic_tags, analysis_result, search_keyword, scraped_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            'xiaohongshu',
            overrides.noteId,
            overrides.title ?? '默认标题',
            '作者',
            'https://xhs.com/explore/' + overrides.noteId,
            overrides.likesCount ?? 0,
            overrides.collectsCount ?? 0,
            overrides.commentsCount ?? 0,
            overrides.type ?? 'image',
            '[]',
            overrides.topicTags ?? null,
            overrides.analysisResult ?? null,
            overrides.searchKeyword ?? null,
        );
    }

    it('getKeywordStats groups by search_keyword and counts', async () => {
        seedTrendingNote({ noteId: 'a1', searchKeyword: '春季穿搭', likesCount: 100 });
        seedTrendingNote({ noteId: 'a2', searchKeyword: '春季穿搭', likesCount: 50 });
        seedTrendingNote({ noteId: 'b1', searchKeyword: '美妆教程', likesCount: 200 });
        seedTrendingNote({ noteId: 'c1' }); // no search_keyword, excluded

        const { NicheRepository } = await import('../../api/db/repositories.js');
        const stats = await NicheRepository.getKeywordStats();

        // Sorted by count desc
        expect(stats).toHaveLength(2);
        expect(stats[0]).toEqual({ keyword: '春季穿搭', count: 2 });
        expect(stats[1]).toEqual({ keyword: '美妆教程', count: 1 });
    });

    it('searchNotes filters by keyword and sorts by likes desc', async () => {
        seedTrendingNote({ noteId: 'a1', searchKeyword: 'x', title: 'A1', likesCount: 10 });
        seedTrendingNote({ noteId: 'a2', searchKeyword: 'x', title: 'A2', likesCount: 50 });
        seedTrendingNote({ noteId: 'a3', searchKeyword: 'x', title: 'A3', likesCount: 30 });
        seedTrendingNote({ noteId: 'b1', searchKeyword: 'y', title: 'B1', likesCount: 999 });

        const { NicheRepository } = await import('../../api/db/repositories.js');
        const result = await NicheRepository.searchNotes({
            keyword: 'x',
            sort: 'likes',
            page: 1,
            pageSize: 10,
        });

        expect(result.total).toBe(3);
        expect(result.data).toHaveLength(3);
        expect(result.data[0].title).toBe('A2'); // 50 likes
        expect(result.data[1].title).toBe('A3'); // 30 likes
        expect(result.data[2].title).toBe('A1'); // 10 likes
    });

    it('searchNotes paginates correctly', async () => {
        for (let i = 0; i < 7; i++) {
            seedTrendingNote({ noteId: `k${i}`, searchKeyword: 'page-test', likesCount: i });
        }

        const { NicheRepository } = await import('../../api/db/repositories.js');
        const page1 = await NicheRepository.searchNotes({
            keyword: 'page-test', sort: 'likes', page: 1, pageSize: 3,
        });
        const page2 = await NicheRepository.searchNotes({
            keyword: 'page-test', sort: 'likes', page: 2, pageSize: 3,
        });

        expect(page1.total).toBe(7);
        expect(page1.data).toHaveLength(3);
        expect(page2.data).toHaveLength(3);
        // Different items on each page
        const idsPage1 = new Set(page1.data.map((d: any) => d.noteId));
        const idsPage2 = new Set(page2.data.map((d: any) => d.noteId));
        const overlap = [...idsPage1].filter((id) => idsPage2.has(id as string));
        expect(overlap).toHaveLength(0);
    });

    it('searchNotes hasAnalysis filter excludes unanalyzed notes', async () => {
        seedTrendingNote({ noteId: 'a1', searchKeyword: 'k', analysisResult: '{"hook_type":"好奇"}' });
        seedTrendingNote({ noteId: 'a2', searchKeyword: 'k' });

        const { NicheRepository } = await import('../../api/db/repositories.js');
        const result = await NicheRepository.searchNotes({
            keyword: 'k', sort: 'likes', page: 1, pageSize: 10, hasAnalysis: true,
        });

        expect(result.total).toBe(1);
        expect(result.data[0].noteId).toBe('a1');
    });

    it('searchNotes topic filter does JSON LIKE substring match', async () => {
        seedTrendingNote({ noteId: 'a1', searchKeyword: 'k', topicTags: '["美妆","教程"]' });
        seedTrendingNote({ noteId: 'a2', searchKeyword: 'k', topicTags: '["穿搭"]' });
        seedTrendingNote({ noteId: 'a3', searchKeyword: 'k' });

        const { NicheRepository } = await import('../../api/db/repositories.js');
        const result = await NicheRepository.searchNotes({
            keyword: 'k', sort: 'likes', page: 1, pageSize: 10, topic: '美妆',
        });

        expect(result.total).toBe(1);
        expect(result.data[0].noteId).toBe('a1');
    });

    it('listRecentVideos returns only video-type notes', async () => {
        seedTrendingNote({ noteId: 'v1', type: 'video' });
        seedTrendingNote({ noteId: 'v2', type: 'video' });
        seedTrendingNote({ noteId: 'i1', type: 'image' });

        const { NicheRepository } = await import('../../api/db/repositories.js');
        const videos = await NicheRepository.listRecentVideos(10);
        expect(videos).toHaveLength(2);
        expect(videos.every((v: any) => v.type === 'video')).toBe(true);
    });
});
