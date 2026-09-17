import db from '../../db.js';
import { ResearchOpportunityService, ResearchEvidence } from './ResearchOpportunityService.js';
import { NoteReviewService, NoteReview } from './NoteReviewService.js';

export interface SyncableNote {
    noteId: string;
    title: string;
    views: number;
    likes: number;
    collects: number;
    comments: number;
    publishDate?: string;
    hasReview: boolean;
    reviewId?: string;
}

export interface NoteFeedbackExtraction {
    noteId: string;
    inquiryComments: Array<{
        id: string;
        content: string;
        userNickname?: string;
        intent?: string;
    }>;
    signals: string[];
}

export class NoteFeedbackSyncService {
    /**
     * 拉取账号已发布的笔记列表及最新指标，标记是否已有复盘记录
     */
    static getSyncableNotes(accountId: number): SyncableNote[] {
        const rows = db.prepare(`
            SELECT note_id, title, views, likes, collects, comments, publish_date
            FROM note_stats
            WHERE account_id = ?
            ORDER BY record_date DESC
        `).all(accountId) as any[];

        return rows.map(r => {
            const reviewRow = db.prepare(`
                SELECT id FROM note_reviews
                WHERE note_id = ? OR (title = ? AND account_id = ?)
                LIMIT 1
            `).get(r.note_id, r.title, accountId) as any;

            return {
                noteId: r.note_id,
                title: r.title,
                views: r.views || 0,
                likes: r.likes || 0,
                collects: r.collects || 0,
                comments: r.comments || 0,
                publishDate: r.publish_date || undefined,
                hasReview: Boolean(reviewRow),
                reviewId: reviewRow ? reviewRow.id : undefined
            };
        });
    }

    /**
     * 自动提取笔记评论区高频疑问、求助与卡点反馈信号
     */
    static extractNoteFeedbackSignals(noteId: string): NoteFeedbackExtraction {
        const commentRows = db.prepare(`
            SELECT id, content, user_nickname, intent
            FROM comments
            WHERE note_id = ?
            ORDER BY created_at DESC
        `).all(noteId) as any[];

        // 识别出属于疑问 (INQUIRY)、投诉/卡点 (COMPLAINT) 或带疑问词的评论
        const inquiries = commentRows.filter(c => {
            if (c.intent === 'INQUIRY' || c.intent === 'COMPLAINT') return true;
            const text = c.content || '';
            return text.includes('?') || text.includes('？') || text.includes('怎么') || text.includes('求') || text.includes('请教');
        });

        const signals = inquiries.map(c => c.content.trim()).filter(Boolean);

        return {
            noteId,
            inquiryComments: inquiries.map(c => ({
                id: c.id,
                content: c.content,
                userNickname: c.user_nickname || undefined,
                intent: c.intent || undefined
            })),
            signals
        };
    }

    /**
     * 将特定评论一键转换为 P1.2 研究证据（Research Evidence）
     */
    static convertCommentToEvidence(commentId: string, accountId: number): ResearchEvidence {
        const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as any;
        if (!comment) throw new Error(`未找到评论: ${commentId}`);

        return ResearchOpportunityService.addEvidence({
            accountId,
            sourceType: 'COMMENT',
            rawText: comment.content,
            authorNickname: comment.user_nickname || undefined,
            painPoints: ['用户评论反馈求助']
        });
    }

    /**
     * 从已同步笔记一键自动生成预填复盘记录
     */
    static autoCreateReviewFromNote(accountId: number, noteId: string): NoteReview {
        const noteRow = db.prepare(`
            SELECT * FROM note_stats WHERE note_id = ? AND account_id = ?
        `).get(noteId, accountId) as any;

        if (!noteRow) throw new Error(`未找到笔记统计数据: ${noteId}`);

        // 提取评论区反馈
        const feedback = this.extractNoteFeedbackSignals(noteId);

        // 评估点击率与互动率
        const views = noteRow.views || 0;
        const likes = noteRow.likes || 0;
        const collects = noteRow.collects || 0;

        const collectRate = views > 0 ? (collects / views) : 0;
        const interactionAssessment = collectRate > 0.05 ? 'HIGH' : 'NORMAL';

        return NoteReviewService.createReview({
            accountId,
            noteId,
            title: noteRow.title,
            publishedAt: (noteRow.publish_date || '').split(' ')[0] || new Date().toISOString().split('T')[0],
            views,
            likes,
            collects,
            comments: noteRow.comments || 0,
            ctrAssessment: 'NORMAL',
            interactionAssessment,
            whatWorked: collects > 100 ? `收藏数达到 ${collects}，干货度获得读者认可` : undefined,
            whatFailed: feedback.signals.length > 0 ? `读者在评论区集中询问细节，说明本篇部分深度未完全拆解` : undefined,
            feedbackSignals: feedback.signals,
            nextActionIdeas: feedback.signals.slice(0, 2).map(s => `关于《${s.slice(0, 25)}》的专题解答`)
        });
    }
}
