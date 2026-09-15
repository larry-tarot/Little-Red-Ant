import crypto from 'node:crypto';
import db from '../../db.js';

export type EvidenceSourceType = 'COMMENT' | 'DM' | 'NOTE' | 'MANUAL';

export interface ResearchEvidence {
    id: string;
    accountId: number;
    sourceType: EvidenceSourceType;
    sourceUrl?: string;
    rawText: string;
    painPoints: string[];
    desires: string[];
    authorNickname?: string;
    createdAt?: string;
}

export type ContentFormat = 'CHECKLIST' | 'CASE_STUDY' | 'TUTORIAL' | 'OPINION' | 'COMPARISON' | 'QA';
export type ExpectedOutcome = 'FAVORITE' | 'TRUST' | 'INQUIRY' | 'DISCUSSION' | 'VALIDATION';
export type OpportunityStatus = 'IDEA' | 'ACCEPTED' | 'DEFERRED' | 'REJECTED';

export interface ContentOpportunity {
    id: string;
    accountId: number;
    title: string;
    targetAudience: string;
    scenario: string;
    problem: string;
    uniqueAngle: string;
    contentFormat: ContentFormat;
    expectedOutcome: ExpectedOutcome;
    contentPillar?: string;
    status: OpportunityStatus;
    decisionReason?: string;
    evidence: ResearchEvidence[];
    createdAt?: string;
    updatedAt?: string;
}

export class ResearchOpportunityService {
    /**
     * 录入一条研究证据（评论、笔记片段、私信或用户原话）
     */
    static addEvidence(data: {
        accountId: number;
        sourceType: EvidenceSourceType;
        sourceUrl?: string;
        rawText: string;
        painPoints?: string[];
        desires?: string[];
        authorNickname?: string;
    }): ResearchEvidence {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO research_evidence (
                id, account_id, source_type, source_url, raw_text,
                pain_points, desires, author_nickname, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            data.accountId,
            data.sourceType,
            data.sourceUrl || null,
            data.rawText,
            JSON.stringify(data.painPoints || []),
            JSON.stringify(data.desires || []),
            data.authorNickname || null,
            now
        );

        return {
            id,
            accountId: data.accountId,
            sourceType: data.sourceType,
            sourceUrl: data.sourceUrl,
            rawText: data.rawText,
            painPoints: data.painPoints || [],
            desires: data.desires || [],
            authorNickname: data.authorNickname,
            createdAt: now
        };
    }

    /**
     * 查询指定账号的证据列表
     */
    static listEvidence(accountId: number): ResearchEvidence[] {
        const rows = db.prepare(`
            SELECT * FROM research_evidence WHERE account_id = ? ORDER BY created_at DESC
        `).all(accountId) as any[];

        return rows.map(r => ({
            id: r.id,
            accountId: r.account_id,
            sourceType: r.source_type,
            sourceUrl: r.source_url || undefined,
            rawText: r.raw_text,
            painPoints: r.pain_points ? JSON.parse(r.pain_points) : [],
            desires: r.desires ? JSON.parse(r.desires) : [],
            authorNickname: r.author_nickname || undefined,
            createdAt: r.created_at
        }));
    }

    /**
     * 创建结构化内容机会卡，并绑定证据
     */
    static createOpportunity(data: {
        accountId: number;
        title: string;
        targetAudience: string;
        scenario: string;
        problem: string;
        uniqueAngle: string;
        contentFormat: ContentFormat;
        expectedOutcome: ExpectedOutcome;
        contentPillar?: string;
        evidenceIds?: string[];
    }): ContentOpportunity {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        const transaction = db.transaction(() => {
            db.prepare(`
                INSERT INTO content_opportunities (
                    id, account_id, title, target_audience, scenario,
                    problem, unique_angle, content_format, expected_outcome,
                    content_pillar, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IDEA', ?, ?)
            `).run(
                id,
                data.accountId,
                data.title,
                data.targetAudience,
                data.scenario,
                data.problem,
                data.uniqueAngle,
                data.contentFormat,
                data.expectedOutcome,
                data.contentPillar || null,
                now,
                now
            );

            if (data.evidenceIds && data.evidenceIds.length > 0) {
                const insertRel = db.prepare(`
                    INSERT INTO opportunity_evidence (opportunity_id, evidence_id, role)
                    VALUES (?, ?, 'PRIMARY')
                `);
                for (const evId of data.evidenceIds) {
                    insertRel.run(id, evId);
                }
            }
        });
        transaction();

        return this.getOpportunity(id)!;
    }

    /**
     * 获取单个机会卡详情（含关联的完整证据）
     */
    static getOpportunity(id: string): ContentOpportunity | null {
        const opp = db.prepare(`
            SELECT * FROM content_opportunities WHERE id = ?
        `).get(id) as any;

        if (!opp) return null;

        const evidenceRows = db.prepare(`
            SELECT e.* FROM research_evidence e
            INNER JOIN opportunity_evidence oe ON e.id = oe.evidence_id
            WHERE oe.opportunity_id = ?
            ORDER BY e.created_at ASC
        `).all(id) as any[];

        const evidence: ResearchEvidence[] = evidenceRows.map(r => ({
            id: r.id,
            accountId: r.account_id,
            sourceType: r.source_type,
            sourceUrl: r.source_url || undefined,
            rawText: r.raw_text,
            painPoints: r.pain_points ? JSON.parse(r.pain_points) : [],
            desires: r.desires ? JSON.parse(r.desires) : [],
            authorNickname: r.author_nickname || undefined,
            createdAt: r.created_at
        }));

        return {
            id: opp.id,
            accountId: opp.account_id,
            title: opp.title,
            targetAudience: opp.target_audience,
            scenario: opp.scenario,
            problem: opp.problem,
            uniqueAngle: opp.unique_angle,
            contentFormat: opp.content_format,
            expectedOutcome: opp.expected_outcome,
            contentPillar: opp.content_pillar || undefined,
            status: opp.status,
            decisionReason: opp.decision_reason || undefined,
            evidence,
            createdAt: opp.created_at,
            updatedAt: opp.updated_at
        };
    }

    /**
     * 查询账号的机会卡列表（可按状态过滤）
     */
    static listOpportunities(accountId: number, status?: OpportunityStatus): ContentOpportunity[] {
        let query = 'SELECT id FROM content_opportunities WHERE account_id = ?';
        const params: any[] = [accountId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        query += ' ORDER BY created_at DESC';

        const rows = db.prepare(query).all(...params) as any[];
        return rows.map(r => this.getOpportunity(r.id)!).filter(Boolean);
    }

    /**
     * 对内容机会卡执行明确决策 (采纳 / 暂缓 / 舍弃)
     */
    static decideOpportunity(id: string, status: OpportunityStatus, decisionReason?: string): ContentOpportunity {
        const now = new Date().toISOString();
        db.prepare(`
            UPDATE content_opportunities
            SET status = ?, decision_reason = ?, updated_at = ?
            WHERE id = ?
        `).run(status, decisionReason || null, now, id);

        const updated = this.getOpportunity(id);
        if (!updated) throw new Error(`Opportunity ${id} not found`);
        return updated;
    }

    /**
     * 导出机会卡完整 Brief 上下文（含用户原话证据，为后续 P1.3 生成正文与标题提供坚实约束）
     */
    static exportOpportunityBrief(id: string): string {
        const opp = this.getOpportunity(id);
        if (!opp) throw new Error(`Opportunity ${id} not found`);

        const lines: string[] = [
            '【内容机会卡 (Content Opportunity)】',
            `- 选题标题: ${opp.title}`,
            `- 目标受众: ${opp.targetAudience}`,
            `- 发生情境/场景: ${opp.scenario}`,
            `- 解决真实痛点: ${opp.problem}`,
            `- 独特立足角度: ${opp.uniqueAngle}`,
            `- 推荐展现形式: ${opp.contentFormat} | 期望商业/互动目标: ${opp.expectedOutcome}`,
            opp.contentPillar ? `- 归属内容栏目: ${opp.contentPillar}` : '',
            '',
            '【关联的用户真实原话证据】'
        ];

        if (opp.evidence.length === 0) {
            lines.push('（暂无关联原始证据）');
        } else {
            opp.evidence.forEach((ev, idx) => {
                lines.push(`[证据 ${idx + 1}] (${ev.sourceType}${ev.authorNickname ? ` - ${ev.authorNickname}` : ''}):`);
                lines.push(`"${ev.rawText}"`);
                if (ev.painPoints.length) lines.push(`* 提取痛点: ${ev.painPoints.join('、')}`);
                if (ev.sourceUrl) lines.push(`* 原文链接: ${ev.sourceUrl}`);
                lines.push('');
            });
        }

        return lines.filter(Boolean).join('\n');
    }
}
