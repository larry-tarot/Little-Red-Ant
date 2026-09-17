import crypto from 'node:crypto';
import db from '../../db.js';
import { ResearchOpportunityService, ContentOpportunity } from './ResearchOpportunityService.js';

export interface NoteReview {
    id: string;
    accountId: number;
    noteId?: string;
    title: string;
    publishedAt?: string;
    views: number;
    likes: number;
    collects: number;
    comments: number;
    ctrAssessment?: 'HIGH' | 'NORMAL' | 'LOW';
    interactionAssessment?: 'HIGH' | 'NORMAL' | 'LOW';
    whatWorked?: string;
    whatFailed?: string;
    feedbackSignals: string[];
    nextActionIdeas: string[];
    createdAt?: string;
    updatedAt?: string;
}

export class NoteReviewService {
    /**
     * 录入或更新笔记复盘
     */
    static createReview(data: {
        accountId: number;
        noteId?: string;
        title: string;
        publishedAt?: string;
        views?: number;
        likes?: number;
        collects?: number;
        comments?: number;
        ctrAssessment?: 'HIGH' | 'NORMAL' | 'LOW';
        interactionAssessment?: 'HIGH' | 'NORMAL' | 'LOW';
        whatWorked?: string;
        whatFailed?: string;
        feedbackSignals?: string[];
        nextActionIdeas?: string[];
    }): NoteReview {
        const id = 'rev_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const feedbackSignals = data.feedbackSignals || [];
        const nextActionIdeas = data.nextActionIdeas || [];

        db.prepare(`
            INSERT INTO note_reviews (
                id, account_id, note_id, title, published_at,
                views, likes, collects, comments,
                ctr_assessment, interaction_assessment,
                what_worked, what_failed,
                feedback_signals, next_action_ideas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            data.accountId,
            data.noteId || null,
            data.title,
            data.publishedAt || null,
            data.views || 0,
            data.likes || 0,
            data.collects || 0,
            data.comments || 0,
            data.ctrAssessment || null,
            data.interactionAssessment || null,
            data.whatWorked || null,
            data.whatFailed || null,
            JSON.stringify(feedbackSignals),
            JSON.stringify(nextActionIdeas)
        );

        return this.getReview(id)!;
    }

    /**
     * 获取单篇复盘详情
     */
    static getReview(id: string): NoteReview | null {
        const row = db.prepare('SELECT * FROM note_reviews WHERE id = ?').get(id) as any;
        if (!row) return null;

        return {
            id: row.id,
            accountId: row.account_id,
            noteId: row.note_id || undefined,
            title: row.title,
            publishedAt: row.published_at || undefined,
            views: row.views,
            likes: row.likes,
            collects: row.collects,
            comments: row.comments,
            ctrAssessment: row.ctr_assessment || undefined,
            interactionAssessment: row.interaction_assessment || undefined,
            whatWorked: row.what_worked || undefined,
            whatFailed: row.what_failed || undefined,
            feedbackSignals: JSON.parse(row.feedback_signals || '[]'),
            nextActionIdeas: JSON.parse(row.next_action_ideas || '[]'),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * 查询账号的所有笔记复盘
     */
    static listReviews(accountId: number): NoteReview[] {
        const rows = db.prepare(`
            SELECT * FROM note_reviews
            WHERE account_id = ?
            ORDER BY created_at DESC
        `).all(accountId) as any[];

        return rows.map(r => ({
            id: r.id,
            accountId: r.account_id,
            noteId: r.note_id || undefined,
            title: r.title,
            publishedAt: r.published_at || undefined,
            views: r.views,
            likes: r.likes,
            collects: r.collects,
            comments: r.comments,
            ctrAssessment: r.ctr_assessment || undefined,
            interactionAssessment: r.interaction_assessment || undefined,
            whatWorked: r.what_worked || undefined,
            whatFailed: r.what_failed || undefined,
            feedbackSignals: JSON.parse(r.feedback_signals || '[]'),
            nextActionIdeas: JSON.parse(r.next_action_ideas || '[]'),
            createdAt: r.created_at,
            updatedAt: r.updated_at
        }));
    }

    /**
     * 关键闭环：从复盘改进想法与真实反馈信号中，一键反哺生成 P1.2 内容机会卡
     */
    static deriveOpportunityFromReview(reviewId: string, params: {
        ideaIndex?: number;
        customTitle?: string;
        targetAudience?: string;
        scenario?: string;
    }): ContentOpportunity {
        const rev = this.getReview(reviewId);
        if (!rev) throw new Error(`未找到复盘记录: ${reviewId}`);

        const ideaTitle = params.customTitle || rev.nextActionIdeas[params.ideaIndex || 0] || `关于《${rev.title}》的下篇迭代内容`;
        const targetAudience = params.targetAudience || '本专栏/系列高粘性读者';
        const scenario = params.scenario || `读完上篇《${rev.title}》并产生深层实操疑问时`;
        const problem = rev.whatFailed
            ? `上篇遗留痛点：${rev.whatFailed}；用户集中反馈：${rev.feedbackSignals.join('；')}`
            : (rev.feedbackSignals.join('；') || '读者呼吁更深入的细化方案');
        const uniqueAngle = `承接上篇验证成功的点（${rev.whatWorked || '实战经验'}），重点补全实操细节`;

        // 将反馈信号落库为证据
        const evidenceIds: string[] = [];
        for (const sig of rev.feedbackSignals) {
            const ev = ResearchOpportunityService.addEvidence({
                accountId: rev.accountId,
                sourceType: 'COMMENT',
                rawText: sig,
                painPoints: [rev.title]
            });
            evidenceIds.push(ev.id);
        }

        // 创建新机会卡并进入选题池
        return ResearchOpportunityService.createOpportunity({
            accountId: rev.accountId,
            title: ideaTitle,
            targetAudience,
            scenario,
            problem,
            uniqueAngle,
            contentFormat: 'TUTORIAL',
            expectedOutcome: 'TRUST',
            contentPillar: '复盘迭代',
            evidenceIds
        });
    }
}
