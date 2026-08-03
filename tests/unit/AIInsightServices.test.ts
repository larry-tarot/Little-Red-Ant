/**
 * AI 洞察类服务单元测试
 *
 * 覆盖范围:
 * - TitleOptimizer (标题优化)
 * - CompetitorNoteAnalyzer (竞品笔记分析)
 * - AIReviewService (AI 复盘)
 * - NoteDiagnosisService (笔记诊断)
 * - GrowthInsightService (成长洞察)
 *
 * 测试策略:
 * 1. Demo 模式返回结构合法的模拟数据
 * 2. 非 Demo 模式调用 AI Provider 并返回解析结果
 * 3. AI Provider 异常被妥善抛出
 *
 * 依赖 mock:
 * - AIFactory.getTextProvider()
 * - DemoService.isDemoMode()
 * - AnalyticsService.getSummary/getHistory (AIReviewService)
 * - db.prepare (NoteDiagnosisService / AIReviewService / GrowthInsightService)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

// ==================== Mock 句柄（hoisted，供 vi.mock factory 引用） ====================

const mockHandles = vi.hoisted(() => ({
    isDemoMode: vi.fn(),
    getTextProvider: vi.fn(),
    getSummary: vi.fn(),
    getHistory: vi.fn(),
    dbPrepare: vi.fn()
}));

// ==================== Mock 依赖模块 ====================

vi.mock('../../api/services/ai/AIFactory.js', () => ({
    AIFactory: {
        getTextProvider: mockHandles.getTextProvider
    }
}));

vi.mock('../../api/services/DemoService.js', () => ({
    DemoService: {
        isDemoMode: mockHandles.isDemoMode
    }
}));

vi.mock('../../api/services/core/AnalyticsService.js', () => ({
    AnalyticsService: {
        getSummary: mockHandles.getSummary,
        getHistory: mockHandles.getHistory
    }
}));

vi.mock('../../api/db.js', () => ({
    default: {
        prepare: mockHandles.dbPrepare
    },
    initDB: vi.fn()
}));

// ==================== 导入被测服务 ====================

import { TitleOptimizer } from '../../api/services/ai/TitleOptimizer.js';
import { CompetitorNoteAnalyzer } from '../../api/services/ai/CompetitorNoteAnalyzer.js';
import { AIReviewService } from '../../api/services/ai/AIReviewService.js';
import { NoteDiagnosisService } from '../../api/services/ai/NoteDiagnosisService.js';
import { GrowthInsightService } from '../../api/services/ai/GrowthInsightService.js';

// ==================== 类型与工具函数 ====================

/**
 * 假 AI Provider 类型
 * 与 AIProvider 接口保持一致，便于在测试里复用
 */
type FakeProvider = {
    generateText: Mock;
    generateJSON: Mock;
    generateImage: Mock;
};

/**
 * 构造可复用的假 AI Provider
 *
 * 参数说明:
 * - overrides: [Partial<FakeProvider>] 覆盖默认的 generateText/generateJSON/generateImage
 *
 * 返回说明:
 * - FakeProvider 包含三个 mock 方法的对象
 */
function createFakeProvider(overrides: Partial<FakeProvider> = {}): FakeProvider {
    return {
        generateText: vi.fn().mockResolvedValue(''),
        generateJSON: vi.fn().mockResolvedValue({}),
        generateImage: vi.fn().mockResolvedValue(''),
        ...overrides
    };
}

/**
 * 模拟 db.prepare 的多查询分发
 *
 * 参数说明:
 * - queries: [{ pattern, get?, all? }] SQL 匹配规则与返回值
 *   - pattern 为 string 时做子串匹配，为 RegExp 时做正则匹配
 *   - get 对应 prepare(...).get() 的返回值
 *   - all 对应 prepare(...).all() 的返回值
 */
function mockDbQueries(queries: Array<{
    pattern: string | RegExp;
    get?: unknown;
    all?: unknown;
}>) {
    mockHandles.dbPrepare.mockImplementation((sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        const matched = queries.find(q => {
            if (typeof q.pattern === 'string') {
                return normalized.includes(q.pattern);
            }
            return q.pattern.test(normalized);
        });

        return {
            get: vi.fn().mockImplementation(() => matched?.get ?? undefined),
            all: vi.fn().mockImplementation(() => matched?.all ?? []),
            run: vi.fn()
        };
    });
}

// ==================== TitleOptimizer ====================

describe('TitleOptimizer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Demo 模式返回结构合法的模拟数据', async () => {
        mockHandles.isDemoMode.mockResolvedValue(true);

        const result = await TitleOptimizer.analyzeTitle('测试标题', '穿搭');

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.breakdown).toHaveProperty('hook_strength');
        expect(result.breakdown).toHaveProperty('keyword_relevance');
        expect(result.breakdown).toHaveProperty('emotional_appeal');
        expect(result.breakdown).toHaveProperty('clarity');
        expect(result.breakdown).toHaveProperty('length_optimal');
        expect(Array.isArray(result.suggestions)).toBe(true);
        expect(Array.isArray(result.variants)).toBe(true);
    });

    it('非 Demo 模式调用 AI Provider 并返回解析结果', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        const aiResult = {
            score: 85,
            breakdown: {
                hook_strength: 8,
                keyword_relevance: 9,
                emotional_appeal: 7,
                clarity: 8,
                length_optimal: true
            },
            suggestions: ['建议1', '建议2'],
            variants: ['变体1', '变体2', '变体3']
        };
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateJSON: vi.fn().mockResolvedValue(aiResult)
        }));

        const result = await TitleOptimizer.analyzeTitle('测试标题');

        expect(result.score).toBe(85);
        expect(result.breakdown.hook_strength).toBe(8);
        expect(result.suggestions).toEqual(['建议1', '建议2']);
        expect(result.variants).toHaveLength(3);
    });

    it('AI Provider 异常被抛出并包装为业务错误', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateJSON: vi.fn().mockRejectedValue(new Error('模型超时'))
        }));

        await expect(TitleOptimizer.analyzeTitle('测试标题')).rejects.toThrow('标题分析失败');
    });
});

// ==================== CompetitorNoteAnalyzer ====================

describe('CompetitorNoteAnalyzer', () => {
    const sampleNote = {
        title: '爆款笔记标题',
        content: '这是正文内容',
        cover_description: '封面描述',
        likes: 1000,
        collects: 500,
        comments: 100
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Demo 模式返回结构合法的模拟数据', async () => {
        mockHandles.isDemoMode.mockResolvedValue(true);

        const result = await CompetitorNoteAnalyzer.analyzeNote(sampleNote);

        expect(result.title_technique).toContain(sampleNote.title);
        expect(result.cover_analysis.length).toBeGreaterThan(0);
        expect(result.structure_analysis.length).toBeGreaterThan(0);
        expect(result.hook_technique.length).toBeGreaterThan(0);
        expect(Array.isArray(result.writing_tips)).toBe(true);
        expect(Array.isArray(result.key_sentences)).toBe(true);
        expect(Array.isArray(result.copy_options)).toBe(true);
    });

    it('非 Demo 模式调用 AI Provider 并返回解析结果', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        const aiResult = {
            title_technique: '技巧',
            cover_analysis: '封面',
            structure_analysis: '结构',
            hook_technique: '钩子',
            writing_tips: ['tip1'],
            key_sentences: ['sentence1'],
            copy_options: ['option1']
        };
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateJSON: vi.fn().mockResolvedValue(aiResult)
        }));

        const result = await CompetitorNoteAnalyzer.analyzeNote(sampleNote);

        expect(result.title_technique).toBe('技巧');
        expect(result.writing_tips).toEqual(['tip1']);
        expect(result.key_sentences).toEqual(['sentence1']);
        expect(result.copy_options).toEqual(['option1']);
    });

    it('AI Provider 异常被抛出并包装为业务错误', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateJSON: vi.fn().mockRejectedValue(new Error('模型超时'))
        }));

        await expect(CompetitorNoteAnalyzer.analyzeNote(sampleNote)).rejects.toThrow('竞品笔记分析失败');
    });
});

// ==================== AIReviewService ====================

describe('AIReviewService', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockHandles.getSummary.mockReturnValue({
            account_name: '测试账号',
            total_notes: 10,
            total_views: 1000,
            total_likes: 100,
            total_comments: 20,
            total_collects: 50,
            total_shares: 5,
            needs_sync: false
        });

        mockHandles.getHistory.mockReturnValue([
            { date: '2026-07-01', views: 100, likes: 10, comments: 2, collects: 5, interaction: 17 }
        ]);

        mockDbQueries([
            {
                pattern: 'ORDER BY likes DESC',
                get: { title: '最佳笔记', views: 1000, likes: 100, comments: 20, collects: 50 }
            },
            {
                pattern: 'ORDER BY likes ASC',
                get: { title: '最差笔记', views: 10, likes: 0, comments: 0, collects: 0 }
            }
        ]);
    });

    it('Demo 模式返回结构合法的模拟数据', async () => {
        mockHandles.isDemoMode.mockResolvedValue(true);

        const result = await AIReviewService.generateReview('week');

        expect(result.summary.length).toBeGreaterThan(0);
        expect(Array.isArray(result.highlights)).toBe(true);
        expect(Array.isArray(result.concerns)).toBe(true);
        expect(Array.isArray(result.suggestions)).toBe(true);
        expect(result.top_note_analysis).toHaveProperty('title');
        expect(result.top_note_analysis).toHaveProperty('reason');
        expect(result.worst_note_analysis).toHaveProperty('title');
        expect(result.worst_note_analysis).toHaveProperty('reason');
    });

    it('非 Demo 模式调用 AI Provider 并返回解析结果', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        const aiResponse = JSON.stringify({
            summary: '本周表现良好',
            highlights: ['亮点1'],
            concerns: ['问题1'],
            suggestions: ['建议1'],
            top_note_analysis: { title: '最佳', reason: '原因' },
            worst_note_analysis: { title: '最差', reason: '原因' }
        });
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateText: vi.fn().mockResolvedValue(aiResponse)
        }));

        const result = await AIReviewService.generateReview('week');

        expect(result.summary).toBe('本周表现良好');
        expect(result.highlights).toEqual(['亮点1']);
        expect(result.concerns).toEqual(['问题1']);
        expect(result.suggestions).toEqual(['建议1']);
        expect(result.top_note_analysis.title).toBe('最佳');
        expect(result.worst_note_analysis.title).toBe('最差');
    });

    it('AI Provider 异常被抛出并包装为业务错误', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateText: vi.fn().mockRejectedValue(new Error('模型超时'))
        }));

        await expect(AIReviewService.generateReview('week')).rejects.toThrow('复盘分析失败');
    });
});

// ==================== NoteDiagnosisService ====================

describe('NoteDiagnosisService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Demo 模式返回结构合法的模拟数据', async () => {
        mockHandles.isDemoMode.mockResolvedValue(true);

        const result = await NoteDiagnosisService.diagnose(1);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.title_analysis).toHaveProperty('score');
        expect(result.title_analysis).toHaveProperty('issues');
        expect(result.title_analysis).toHaveProperty('tips');
        expect(result.timing_analysis).toHaveProperty('is_optimal');
        expect(result.timing_analysis).toHaveProperty('suggestion');
        expect(result.tag_analysis).toHaveProperty('missing_keywords');
        expect(result.tag_analysis).toHaveProperty('suggestion');
        expect(Array.isArray(result.action_suggestions)).toBe(true);
    });

    it('非 Demo 模式调用 AI Provider 并返回解析结果', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        mockDbQueries([
            {
                pattern: 'FROM note_stats WHERE id = ?',
                get: {
                    id: 1,
                    title: '笔记标题',
                    draft_id: 10,
                    views: 100,
                    likes: 10,
                    comments: 2,
                    collects: 5,
                    shares: 1,
                    publish_date: '2026-07-01 15:00:00'
                }
            },
            {
                pattern: 'FROM drafts WHERE id = ?',
                get: { tags: '["穿搭", "春日"]', content_type: 'note' }
            }
        ]);

        const aiResponse = JSON.stringify({
            score: 80,
            title_analysis: { score: 8, issues: ['问题'], tips: ['建议'] },
            timing_analysis: { is_optimal: true, suggestion: '建议' },
            tag_analysis: { missing_keywords: ['关键词'], suggestion: ['标签'] },
            action_suggestions: ['行动建议']
        });
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateText: vi.fn().mockResolvedValue(aiResponse)
        }));

        const result = await NoteDiagnosisService.diagnose(1);

        expect(result.score).toBe(80);
        expect(result.title_analysis.score).toBe(8);
        expect(result.action_suggestions).toEqual(['行动建议']);
    });

    it('笔记不存在时抛出明确错误', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        mockDbQueries([
            { pattern: 'FROM note_stats WHERE id = ?', get: undefined }
        ]);

        await expect(NoteDiagnosisService.diagnose(999)).rejects.toThrow('笔记 ID 999 不存在');
    });

    it('AI Provider 异常被抛出并包装为业务错误', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        mockDbQueries([
            {
                pattern: 'FROM note_stats WHERE id = ?',
                get: {
                    id: 1,
                    title: '笔记标题',
                    draft_id: null,
                    views: 0,
                    likes: 0,
                    comments: 0,
                    collects: 0,
                    shares: 0,
                    publish_date: null
                }
            }
        ]);

        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateText: vi.fn().mockRejectedValue(new Error('模型超时'))
        }));

        await expect(NoteDiagnosisService.diagnose(1)).rejects.toThrow('笔记诊断失败');
    });
});

// ==================== GrowthInsightService ====================

describe('GrowthInsightService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Demo 模式返回结构合法的模拟数据', async () => {
        mockHandles.isDemoMode.mockResolvedValue(true);

        const result = await GrowthInsightService.analyzeGrowth();

        expect(Array.isArray(result.niche_trends)).toBe(true);
        expect(Array.isArray(result.writing_improvements)).toBe(true);
        expect(Array.isArray(result.next_steps)).toBe(true);
        expect(Array.isArray(result.skill_progress)).toBe(true);
    });

    it('非 Demo 模式调用 AI Provider 并返回解析结果', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        mockDbQueries([
            {
                pattern: 'WHERE publish_date >= ?',
                all: [
                    {
                        title: '笔记1',
                        views: 100,
                        likes: 10,
                        comments: 2,
                        collects: 5,
                        publish_date: '2026-07-01',
                        draft_tags: '["穿搭"]',
                        draft_content_type: 'note'
                    },
                    {
                        title: '笔记2',
                        views: 200,
                        likes: 20,
                        comments: 4,
                        collects: 10,
                        publish_date: '2026-07-02',
                        draft_tags: '["美妆"]',
                        draft_content_type: 'note'
                    }
                ]
            }
        ]);

        const aiResult = {
            niche_trends: [{ topic: '话题', growth: '增长', opportunity: '机会' }],
            writing_improvements: [{ aspect: '标题', before_avg: 10, after_avg: 20, tip: '建议' }],
            next_steps: [{ action: '行动', reason: '原因', expected_impact: '效果' }],
            skill_progress: [{ skill: '技能', level: '等级', improvement: '提升' }]
        };
        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateJSON: vi.fn().mockResolvedValue(aiResult)
        }));

        const result = await GrowthInsightService.analyzeGrowth();

        expect(result.niche_trends).toHaveLength(1);
        expect(result.niche_trends[0].topic).toBe('话题');
        expect(result.next_steps[0].action).toBe('行动');
    });

    it('AI Provider 异常被抛出并包装为业务错误', async () => {
        mockHandles.isDemoMode.mockResolvedValue(false);

        mockDbQueries([
            { pattern: 'WHERE publish_date >= ?', all: [] }
        ]);

        mockHandles.getTextProvider.mockReturnValue(createFakeProvider({
            generateJSON: vi.fn().mockRejectedValue(new Error('模型超时'))
        }));

        await expect(GrowthInsightService.analyzeGrowth()).rejects.toThrow('成长分析失败');
    });
});
