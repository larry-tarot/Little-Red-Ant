/**
 * 功能描述：数据看板模块共享类型定义
 *
 * 设计思路：
 * 将数据看板涉及的后端响应结构与前端状态类型集中管理，
 * 避免在页面组件和子组件中重复定义，提高可维护性。
 */

export interface SummaryStats {
    account_name: string;
    total_notes: number;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_collects: number;
    total_shares: number;
    last_sync_at?: string | null;
    needs_sync: boolean;
}

export interface NoteStat {
    note_id: string;
    title: string;
    cover_image: string;
    views: number;
    likes: number;
    comments: number;
    collects: number;
    shares: number;
    publish_date: string;
    xsec_token?: string;
    record_date: string;
}

export interface EngagementStats {
    intents: {
        PRAISE: number;
        COMPLAINT: number;
        INQUIRY: number;
        OTHER: number;
    };
    replyStats: {
        total: number;
        replied: number;
        rate: number;
    };
    dailyTrend: { date: string; count: number }[];
}

export interface PaginationState {
    page: number;
    pageSize: number;
    total: number;
}

export interface PaginatedNotes {
    data: NoteStat[];
    total: number;
    page: number;
    pageSize: number;
}
