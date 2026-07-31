import React from 'react';
import { BarChart, Eye, Heart, MessageCircle, Star, RefreshCw, Loader2, Download, X, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAnalytics } from '../hooks/useAnalytics';
import { MetricCard } from '../components/analytics/MetricCard';
import { SyncStatusBar } from '../components/analytics/SyncStatusBar';
import { EngagementPanel } from '../components/analytics/EngagementPanel';
import { TrendChart } from '../components/analytics/TrendChart';
import { NotesTable } from '../components/analytics/NotesTable';
import FriendlyError from '../components/FriendlyError';
import type { SummaryStats } from '../components/analytics/types';
import { wrapError } from '../utils/ErrorMessages';

/**
 * 功能描述：空状态展示
 *
 * 设计思路：
 * 当账号暂无笔记数据时，统一展示引导文案与同步按钮。
 */
interface EmptyNotesStateProps {
    onRefresh: () => void;
    refreshing: boolean;
    accountName?: string;
}

function EmptyNotesState({ onRefresh, refreshing, accountName }: EmptyNotesStateProps) {
    return (
        <div className="bg-surface rounded-lg shadow-sm border border-border p-8 mb-8">
            <div className="text-center">
                <BarChart size={48} className="mx-auto mb-4 text-text-tertiary" />
                <h3 className="text-lg font-medium text-text mb-2">暂无笔记数据</h3>
                <p className="text-text-tertiary mb-4 max-w-lg mx-auto">
                    {accountName
                        ? `账号「${accountName}」还没有同步到任何笔记数据。数据看板需要至少一次同步后才能展示阅读量、点赞、收藏、评论等指标。`
                        : '当前账号还没有同步到任何笔记数据，数据看板无法展示阅读量、点赞、收藏、评论等指标。'}
                </p>
                <button
                    onClick={onRefresh}
                    disabled={refreshing}
                    className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-primary-text transition-colors shadow-sm
                    ${refreshing ? 'bg-primary cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'}`}
                >
                    <RefreshCw className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} size={16} />
                    {refreshing ? '正在同步...' : '立即同步最新数据'}
                </button>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
                <h4 className="text-sm font-medium text-text mb-3 flex items-center">
                    <AlertCircle size={16} className="mr-2 text-text-tertiary" />
                    没有数据？可能是以下原因
                </h4>
                <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside">
                    <li>新绑定的账号尚未执行过首次数据同步</li>
                    <li>小红书账号 Cookie 已过期，需要重新授权</li>
                    <li>账号下暂无公开笔记，或笔记被设置为私密</li>
                </ul>
            </div>
        </div>
    );
}

/**
 * 功能描述：汇总指标卡片区
 *
 * 设计思路：
 * 根据 SummaryStats 计算并渲染四张核心指标卡片，与主页面解耦。
 */
function SummaryCards({ summary, engagement }: { summary: SummaryStats; engagement: { replyStats: { total: number; replied: number } } | null }) {
    const interactionRate = summary.total_views > 0
        ? ((summary.total_likes + summary.total_collects + summary.total_comments) / summary.total_views * 100).toFixed(2)
        : '0.00';
    const collectLikeRate = summary.total_likes > 0
        ? (summary.total_collects / summary.total_likes * 100).toFixed(2)
        : '0.00';
    const pendingReplies = engagement ? engagement.replyStats.total - engagement.replyStats.replied : 0;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricCard
                label="总阅读量"
                value={summary.total_views.toLocaleString()}
                icon={<Eye size={20} />}
                badge={`笔记 ${summary.total_notes.toLocaleString()}`}
                colorClass="bg-primary-subtle text-primary"
            />
            <MetricCard
                label="总点赞"
                value={summary.total_likes.toLocaleString()}
                icon={<Heart size={20} />}
                badge={`互动率 ${interactionRate}%`}
                colorClass="bg-danger-subtle text-danger"
            />
            <MetricCard
                label="总收藏"
                value={summary.total_collects.toLocaleString()}
                icon={<Star size={20} />}
                badge={`收藏/点赞 ${collectLikeRate}%`}
                colorClass="bg-warning-subtle text-warning"
            />
            <MetricCard
                label="总评论"
                value={summary.total_comments.toLocaleString()}
                icon={<MessageCircle size={20} />}
                badge={`待回复 ${pendingReplies}`}
                colorClass="bg-success-subtle text-success"
            />
        </div>
    );
}

/**
 * 功能描述：数据看板页面
 *
 * 设计思路：
 * 页面容器只负责布局与组合，数据逻辑交给 useAnalytics Hook，
 * 展示逻辑拆分为 MetricCard / SyncStatusBar / EngagementPanel / TrendChart / NotesTable 等子组件。
 */
export default function Analytics() {
    const navigate = useNavigate();
    const { state, pagination, actions } = useAnalytics();
    const { summary, engagement, notes, chartData, loading, listLoading, refreshing, error } = state;

    const errorAction = (() => {
        if (!error) return undefined;
        const wrapped = wrapError(error).friendly;
        if (wrapped.code === 'COOKIE_EXPIRED' || wrapped.code === 'NO_ACTIVE_ACCOUNT') {
            return { label: '前往账号矩阵', onClick: () => navigate('/accounts') };
        }
        return undefined;
    })();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-muted">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-text flex items-center">
                            <BarChart className="mr-2 text-primary" />
                            数据看板
                        </h1>
                        {summary && (
                            <p className="text-sm text-text-tertiary mt-1">
                                当前账号: <span className="font-medium text-primary">{summary.account_name}</span>
                            </p>
                        )}
                    </div>

                    <div className="flex items-center space-x-3">
                        <button
                            onClick={actions.handleExport}
                            className="flex items-center px-4 py-2 rounded-md text-sm font-medium text-text-secondary bg-surface border border-strong hover:bg-surface-muted transition-colors shadow-sm"
                            title="导出数据为 Excel"
                        >
                            <Download className="mr-2" size={16} />
                            导出 Excel
                        </button>

                        {refreshing ? (
                            <button
                                onClick={actions.cancelRefresh}
                                className="flex items-center px-4 py-2 rounded-md text-sm font-medium text-text-secondary bg-surface border border-strong hover:bg-surface-muted transition-colors shadow-sm"
                            >
                                <X className="mr-2" size={16} />
                                取消同步
                            </button>
                        ) : (
                            <button
                                onClick={actions.handleRefresh}
                                disabled={refreshing}
                                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium text-primary-text transition-colors shadow-sm
                                ${refreshing ? 'bg-primary cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'}`}
                            >
                                <RefreshCw className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} size={16} />
                                {refreshing ? '正在同步数据...' : '同步最新数据'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mb-6">
                        <FriendlyError
                            error={wrapError(error).friendly}
                            onRetry={actions.handleRefresh}
                            action={errorAction}
                        />
                    </div>
                )}

                {/* Sync Status */}
                {summary && (
                    <SyncStatusBar
                        accountName={summary.account_name}
                        lastSyncAt={summary.last_sync_at}
                        needsSync={summary.needs_sync}
                    />
                )}

                {/* Summary Cards */}
                {summary && summary.total_notes > 0 && (
                    <SummaryCards summary={summary} engagement={engagement} />
                )}

                {/* Empty State */}
                {summary && summary.total_notes === 0 && (
                    <EmptyNotesState
                        onRefresh={actions.handleRefresh}
                        refreshing={refreshing}
                        accountName={summary.account_name}
                    />
                )}

                {/* Engagement Analysis */}
                <EngagementPanel engagement={engagement} />

                {/* Trend Chart */}
                <TrendChart data={chartData} />

                {/* Notes Table */}
                <NotesTable
                    notes={notes}
                    loading={listLoading}
                    pagination={pagination}
                    onPageChange={actions.handlePageChange}
                    onPageSizeChange={actions.handlePageSizeChange}
                    onOpenInBrowser={actions.handleOpenInBrowser}
                />
            </div>
        </div>
    );
}
