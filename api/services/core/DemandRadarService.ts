import crypto from 'node:crypto';
import db from '../../db.js';
import { ResearchOpportunityService, ContentOpportunity, ContentFormat, ExpectedOutcome } from './ResearchOpportunityService.js';

export interface KeywordWatch {
    id: string;
    accountId: number;
    keyword: string;
    category?: string;
    targetAudience?: string;
    minLikesThreshold: number;
    isActive: boolean;
    lastSyncedAt?: string;
    createdAt?: string;
}

export interface RadarSignal {
    sourceType: 'COMMENT' | 'DM' | 'NOTE' | 'MANUAL';
    rawText: string;
    author?: string;
    likes?: number;
    sourceUrl?: string;
}

export interface OpportunityCandidate {
    id: string;
    accountId: number;
    keyword: string;
    title: string;
    targetAudience: string;
    scenario: string;
    problem: string;
    uniqueAngle: string;
    contentFormat: ContentFormat;
    expectedOutcome: ExpectedOutcome;
    signals: RadarSignal[];
    evidenceCount: number;
}

export class DemandRadarService {
    /**
     * 注册/添加监控关键词
     */
    static addKeywordWatch(data: {
        accountId: number;
        keyword: string;
        category?: string;
        targetAudience?: string;
        minLikesThreshold?: number;
    }): KeywordWatch {
        const id = 'watch_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const threshold = data.minLikesThreshold !== undefined ? data.minLikesThreshold : 50;

        db.prepare(`
            INSERT INTO demand_radar_watches (
                id, account_id, keyword, category, target_audience,
                min_likes_threshold, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(
            id,
            data.accountId,
            data.keyword.trim(),
            data.category || null,
            data.targetAudience || null,
            threshold
        );

        return this.getWatch(id)!;
    }

    /**
     * 查询监控项详情
     */
    static getWatch(id: string): KeywordWatch | null {
        const row = db.prepare('SELECT * FROM demand_radar_watches WHERE id = ?').get(id) as any;
        if (!row) return null;

        return {
            id: row.id,
            accountId: row.account_id,
            keyword: row.keyword,
            category: row.category || undefined,
            targetAudience: row.target_audience || undefined,
            minLikesThreshold: row.min_likes_threshold,
            isActive: Boolean(row.is_active),
            lastSyncedAt: row.last_synced_at || undefined,
            createdAt: row.created_at
        };
    }

    /**
     * 查询账号的所有监控项
     */
    static listWatches(accountId: number): KeywordWatch[] {
        const rows = db.prepare(`
            SELECT * FROM demand_radar_watches
            WHERE account_id = ?
            ORDER BY created_at DESC
        `).all(accountId) as any[];

        return rows.map(r => ({
            id: r.id,
            accountId: r.account_id,
            keyword: r.keyword,
            category: r.category || undefined,
            targetAudience: r.target_audience || undefined,
            minLikesThreshold: r.min_likes_threshold,
            isActive: Boolean(r.is_active),
            lastSyncedAt: r.last_synced_at || undefined,
            createdAt: r.created_at
        }));
    }

    /**
     * 删除监控项
     */
    static deleteWatch(id: string): boolean {
        const result = db.prepare('DELETE FROM demand_radar_watches WHERE id = ?').run(id);
        return result.changes > 0;
    }

    /**
     * 需求雷达算法：将收集到的评论/笔记痛点聚类合成为机会卡候选（Candidate）
     */
    static synthesizeCandidate(params: {
        accountId: number;
        keyword: string;
        signals: RadarSignal[];
        targetAudience?: string;
        scenario?: string;
    }): OpportunityCandidate {
        const targetAudience = params.targetAudience || '相关兴趣/从业受众';
        const scenario = params.scenario || `搜索或关注【${params.keyword}】核心问题时`;

        // 提取信号里最具代表性的痛点原话
        const primaryText = params.signals[0]?.rawText || params.keyword;
        const problemSummary = params.signals.map(s => s.rawText).join('；');

        const title = `关于【${params.keyword}】的高频避坑实操指南`;
        const uniqueAngle = `针对真实用户痛点：“${primaryText.slice(0, 30)}...”，以实战经验和原理解读为切入点`;

        return {
            id: 'cand_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
            accountId: params.accountId,
            keyword: params.keyword,
            title,
            targetAudience,
            scenario,
            problem: problemSummary,
            uniqueAngle,
            contentFormat: 'TUTORIAL',
            expectedOutcome: 'TRUST',
            signals: params.signals,
            evidenceCount: params.signals.length
        };
    }

    /**
     * 将雷达合成的候选机会一键采纳（Adopt）并导入为 P1.2 的正式内容机会卡
     */
    static adoptCandidateToOpportunity(candidate: OpportunityCandidate): ContentOpportunity {
        // 1. 将 signals 全部落库为 research_evidence
        const evidenceIds: string[] = [];
        for (const sig of candidate.signals) {
            const ev = ResearchOpportunityService.addEvidence({
                accountId: candidate.accountId,
                sourceType: sig.sourceType,
                sourceUrl: sig.sourceUrl,
                rawText: sig.rawText,
                authorNickname: sig.author,
                painPoints: [candidate.keyword]
            });
            evidenceIds.push(ev.id);
        }

        // 2. 创建 P1.2 机会卡，状态标记为 ACCEPTED
        const opp = ResearchOpportunityService.createOpportunity({
            accountId: candidate.accountId,
            title: candidate.title,
            targetAudience: candidate.targetAudience,
            scenario: candidate.scenario,
            problem: candidate.problem,
            uniqueAngle: candidate.uniqueAngle,
            contentFormat: candidate.contentFormat,
            expectedOutcome: candidate.expectedOutcome,
            contentPillar: candidate.keyword,
            evidenceIds
        });

        // 3. 标记为已采纳
        return ResearchOpportunityService.decideOpportunity(opp.id, 'ACCEPTED', '来自 P2.1 需求雷达自动合成并采纳');
    }
}
