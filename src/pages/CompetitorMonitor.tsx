
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Trash2, Target, TrendingUp, X, Lightbulb, Key, BookOpen, AlertCircle, Plus, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import FriendlyError from '../components/FriendlyError';
import { useCompetitors } from '../hooks/useCompetitors';

interface FriendlyErrorData {
    code?: string;
    title: string;
    message: string;
    suggestion: string;
    severity: 'error' | 'warning' | 'info';
}

interface WrappedFriendlyError {
    friendly?: FriendlyErrorData;
    original?: string;
    timestamp?: string;
}

interface Competitor {
    id: number;
    user_id: string;
    nickname: string;
    avatar?: string;
    desc?: string;
    fans_count: number;
    notes_count: number;
    total_likes?: number;
    total_comments?: number;
    total_collects?: number;
    last_updated: string;
    status: 'active' | 'pending' | 'processing' | 'refreshing' | 'error';
    last_error?: string;
    analysis_result?: any;
    latest_notes?: any[];
    friendlyError?: WrappedFriendlyError | null;
}

export default function CompetitorMonitor() {
    const {
        competitors,
        loading,
        refreshing,
        refreshCompetitor,
        deleteCompetitor
    } = useCompetitors();

    type StatusFilter = 'all' | 'active' | 'error' | 'pending';

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    // Analysis Modal State
    const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);
    const [selectedCompetitorName, setSelectedCompetitorName] = useState('');

    // Delete Modal State
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Batch Selection State
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);

    const handleRefresh = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        await refreshCompetitor(id);
    };

    const toggleSelection = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const filteredCompetitors = competitors.filter((competitor) => {
        const matchesSearch =
            competitor.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
            competitor.user_id.toLowerCase().includes(searchTerm.toLowerCase());

        if (statusFilter === 'all') return matchesSearch;
        if (statusFilter === 'active') return matchesSearch && competitor.status === 'active';
        if (statusFilter === 'error') return matchesSearch && competitor.status === 'error';
        if (statusFilter === 'pending') {
            return matchesSearch && ['pending', 'processing', 'refreshing'].includes(competitor.status);
        }
        return matchesSearch;
    });

    const handleSelectAll = () => {
        if (selectedIds.size === filteredCompetitors.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredCompetitors.map((c) => c.id)));
        }
    };

    const handleBatchRefresh = async () => {
        if (selectedIds.size === 0) return;

        setIsBatchProcessing(true);
        const toastId = toast.loading(`正在批量更新 ${selectedIds.size} 个账号...`);
        const ids = Array.from(selectedIds);

        let successCount = 0;
        for (const id of ids) {
            try {
                await refreshCompetitor(id);
                successCount++;
            } catch (_e) {
                toast.error('账号更新失败');
            }
        }

        toast.success(`批量请求完成: 成功 ${successCount}/${ids.length}`, { id: toastId });
        setIsBatchProcessing(false);
        setSelectedIds(new Set());
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`确定要删除选中的 ${selectedIds.size} 个账号吗？此操作不可恢复。`)) return;

        setIsBatchProcessing(true);
        const toastId = toast.loading('正在批量删除...');
        const ids = Array.from(selectedIds);

        let successCount = 0;
        for (const id of ids) {
            try {
                await deleteCompetitor(id);
                successCount++;
            } catch (_e) {
                toast.error('账号删除失败');
            }
        }

        toast.success(`删除完成: 成功 ${successCount}/${ids.length}`, { id: toastId });
        setIsBatchProcessing(false);
        setSelectedIds(new Set());
    };

    const confirmDelete = (id: number) => {
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        await deleteCompetitor(deleteId);
        setIsDeleteModalOpen(false);
        setDeleteId(null);
    };

    const openAnalysis = (competitor: Competitor) => {
        if (['pending', 'processing', 'error'].includes(competitor.status)) {
            return;
        }
        if (!competitor.analysis_result || Object.keys(competitor.analysis_result).length === 0) {
            toast('暂无分析报告，请点击“更新数据”按钮', { icon: 'ℹ️' });
            return;
        }
        setSelectedCompetitorName(competitor.nickname);
        setSelectedAnalysis(competitor.analysis_result);
    };

    const getStatusBadge = (status: string, lastError?: string) => {
        switch (status) {
            case 'pending':
            case 'processing':
            case 'refreshing':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-subtle text-primary animate-pulse">
                        <RefreshCw size={12} className="mr-1 animate-spin" />
                        {status === 'pending' ? '初始化中...' : '数据更新中...'}
                    </span>
                );
            case 'error':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger-subtle text-danger" title={lastError}>
                        <AlertTriangle size={12} className="mr-1" />
                        更新失败
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-subtle text-success">
                        <CheckCircle2 size={12} className="mr-1" />
                        监控中
                    </span>
                );
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="对标账号监控"
                    icon={Target}
                    description="监控竞品动向，AI 自动拆解爆款策略。"
                />
                <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
                    <Skeleton className="h-10 flex-1 rounded-lg" />
                    <Skeleton className="h-10 w-48 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="bg-surface rounded-xl shadow-sm border border-border p-5 flex flex-col h-[280px]">
                            <div className="flex items-center mb-4">
                                <Skeleton className="w-12 h-12 rounded-full mr-3" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-4 bg-surface-muted rounded-lg p-3">
                                <div className="space-y-2 flex flex-col items-center">
                                    <Skeleton className="h-3 w-8" />
                                    <Skeleton className="h-4 w-12" />
                                </div>
                                <div className="space-y-2 flex flex-col items-center">
                                    <Skeleton className="h-3 w-8" />
                                    <Skeleton className="h-4 w-12" />
                                </div>
                            </div>
                            <Skeleton className="flex-1 rounded-lg mb-4" />
                            <div className="flex gap-2 mt-auto">
                                <Skeleton className="h-9 flex-1 rounded-lg" />
                                <Skeleton className="h-9 flex-1 rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="对标账号监控"
                icon={Target}
                description="监控竞品动向，AI 自动拆解爆款策略。"
                action={
                    <Link
                        to="/competitor/add"
                        className="inline-flex items-center px-4 py-2 bg-primary text-primary-text rounded-md hover:bg-primary-hover transition-colors shadow-sm"
                    >
                        <Plus size={18} className="mr-2" />
                        添加对标账号
                    </Link>
                }
            />

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-4 max-w-2xl items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={18} />
                    <input
                        type="text"
                        placeholder="搜索昵称或 ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                </div>
                <div className="relative w-full sm:w-48">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                        className="w-full appearance-none pl-4 pr-10 py-2.5 border border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm bg-surface"
                    >
                        <option value="all">所有状态</option>
                        <option value="active">监控中</option>
                        <option value="pending">更新中</option>
                        <option value="error">更新失败</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                {filteredCompetitors.length > 0 && (
                    <button
                        onClick={handleSelectAll}
                        className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap
                            ${selectedIds.size === filteredCompetitors.length && filteredCompetitors.length > 0
                                ? 'bg-primary-subtle border-primary-subtle text-primary'
                                : 'bg-surface border-strong text-text-secondary hover:bg-surface-muted'}`}
                    >
                        {selectedIds.size === filteredCompetitors.length ? '取消全选' : '全选'}
                    </button>
                )}
            </div>

            {/* Batch Actions Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-surface shadow-xl border border-border rounded-full px-6 py-3 flex items-center gap-4 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <span className="text-sm font-bold text-text-secondary">
                        已选择 {selectedIds.size} 项
                    </span>
                    <div className="h-4 w-px bg-border-strong"></div>
                    <button
                        onClick={handleBatchRefresh}
                        disabled={isBatchProcessing || refreshing}
                        className="flex items-center text-sm font-medium text-primary hover:text-primary-hover disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                        批量更新
                    </button>
                    <button
                        onClick={handleBatchDelete}
                        disabled={isBatchProcessing}
                        className="flex items-center text-sm font-medium text-danger hover:text-danger disabled:opacity-50"
                    >
                        <Trash2 size={16} className="mr-1.5" />
                        批量删除
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="ml-2 text-text-tertiary hover:text-text-secondary"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Competitors Grid */}
            {filteredCompetitors.length === 0 ? (
                <EmptyState
                    title="暂无对标账号"
                    description="添加对标账号，系统将自动监控其更新并拆解爆款策略。"
                    icon={Target}
                    action={
                        <Link
                            to="/competitor/add"
                            className="inline-flex items-center px-4 py-2 bg-primary text-primary-text rounded-md hover:bg-primary-hover transition-colors"
                        >
                            <Plus size={16} className="mr-2" />
                            添加第一个账号
                        </Link>
                    }
                    steps={[
                        { text: '复制小红书博主主页链接' },
                        { text: '粘贴链接并点击添加' },
                        { text: '系统自动抓取数据并分析' }
                    ]}
                    tip="支持批量添加，一次最多可添加 10 个对标账号"
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCompetitors.map((competitor) => (
                        <div
                            key={competitor.id}
                            className={`bg-surface rounded-xl shadow-sm border p-5 flex flex-col h-full hover:shadow-md transition-all relative group cursor-pointer
                                ${selectedIds.has(competitor.id) ? 'border-primary ring-1 ring-primary bg-primary-subtle/10' : 'border-border'}
                            `}
                            onClick={() => openAnalysis(competitor)}
                        >
                            {/* Selection Checkbox */}
                            <div
                                className="absolute top-3 left-3 z-10"
                                onClick={(e) => toggleSelection(competitor.id, e)}
                            >
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                                    ${selectedIds.has(competitor.id)
                                        ? 'bg-primary border-primary text-primary-text'
                                        : 'bg-surface border-strong text-transparent hover:border-primary'
                                    }`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                            </div>

                            {/* Header */}
                            <div className="flex items-start justify-between mb-4 pl-6">
                                <div className="flex items-center">
                                    <div className="w-12 h-12 bg-primary-subtle rounded-full flex items-center justify-center overflow-hidden border border-primary-subtle flex-shrink-0">
                                        {competitor.avatar ? (
                                            <img src={competitor.avatar} alt={competitor.nickname} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        ) : (
                                            <span className="text-primary font-bold text-lg">
                                                {(competitor.nickname || 'U').charAt(0)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="ml-3 min-w-0">
                                        <h3 className="font-bold text-text line-clamp-1" title={competitor.nickname}>{competitor.nickname}</h3>
                                        <div className="flex items-center mt-1 space-x-2">
                                            {getStatusBadge(competitor.status, competitor.last_error)}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => confirmDelete(competitor.id)}
                                    className="text-text-tertiary hover:text-danger p-1.5 hover:bg-danger-subtle rounded-lg transition-colors"
                                    title="删除"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-2 mb-4 bg-surface-muted rounded-lg p-3">
                                <div className="text-center border-r border-border">
                                    <div className="text-xs text-text-tertiary mb-1">粉丝数</div>
                                    <div className="font-bold text-text">
                                        {competitor.fans_count ? competitor.fans_count.toLocaleString() : '-'}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-text-tertiary mb-1">笔记数</div>
                                    <div className="font-bold text-text">
                                        {competitor.notes_count ? competitor.notes_count.toLocaleString() : '-'}
                                    </div>
                                </div>
                            </div>

                            {/* Analysis Preview */}
                            {competitor.status === 'active' && competitor.analysis_result && !competitor.analysis_result.error ? (
                                <div className="mb-4 p-3 bg-success-subtle rounded-lg border border-success-subtle text-xs text-success cursor-pointer hover:bg-success-subtle transition-colors group" onClick={() => openAnalysis(competitor)}>
                                    <div className="font-bold mb-1 flex items-center text-success">
                                        <Lightbulb size={12} className="mr-1.5 fill-success text-success"/>
                                        AI 策略分析
                                    </div>
                                    <div className="line-clamp-2 opacity-80 leading-relaxed group-hover:opacity-100">
                                        {competitor.analysis_result.content_strategy || '点击查看详情'}
                                    </div>
                                </div>
                            ) : competitor.status === 'error' ? (
                                <div className="mb-4 space-y-2">
                                    <FriendlyError
                                        error={competitor.friendlyError?.friendly || {
                                            title: '更新失败',
                                            message: competitor.last_error || '未知错误',
                                            suggestion: '请稍后重试，或检查账号状态',
                                            severity: 'error'
                                        }}
                                        onRetry={() => refreshCompetitor(competitor.id)}
                                        action={(() => {
                                            const code = competitor.friendlyError?.friendly?.code;
                                            if (code === 'COOKIE_EXPIRED' || code === 'NO_ACTIVE_ACCOUNT') {
                                                return { label: '前往账号矩阵', onClick: () => window.location.href = '/accounts' };
                                            }
                                            return undefined;
                                        })()}
                                    />
                                </div>
                            ) : (
                                <div className="mb-4 p-3 bg-surface-muted rounded-lg border border-border text-xs text-text-tertiary flex items-center justify-center h-[72px]">
                                    {['pending', 'processing', 'refreshing'].includes(competitor.status) ? (
                                        <span className="flex items-center"><RefreshCw size={14} className="mr-2 animate-spin"/> 正在分析数据...</span>
                                    ) : (
                                        <span>暂无分析数据</span>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 mt-auto pt-4 border-t border-border">
                                <button
                                    onClick={(e) => handleRefresh(competitor.id, e)}
                                    disabled={['pending', 'processing', 'refreshing'].includes(competitor.status) || refreshing}
                                    className="flex-1 flex items-center justify-center px-3 py-2 bg-surface border border-border text-text-secondary text-sm rounded-lg hover:bg-surface-muted hover:border-strong disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                                >
                                    <RefreshCw size={14} className={`mr-1.5 ${['pending', 'processing', 'refreshing'].includes(competitor.status) ? 'animate-spin' : ''}`} />
                                    {['pending', 'processing', 'refreshing'].includes(competitor.status) ? '更新中' : '更新数据'}
                                </button>
                                <Link
                                    to={`/competitor/${competitor.id}`}
                                    className="flex-1 flex items-center justify-center px-3 py-2 bg-primary text-primary-text text-sm rounded-lg hover:bg-primary-hover shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                                >
                                    <BookOpen size={16} className="mr-1.5" />
                                    查看详情
                                </Link>
                            </div>

                            {/* Last Updated */}
                            <div className="mt-3 text-center">
                                <p className="text-[10px] text-text-tertiary flex items-center justify-center">
                                    <Clock size={10} className="mr-1" />
                                    更新于 {competitor.last_updated ? formatDistanceToNow(new Date(competitor.last_updated), { addSuffix: true, locale: zhCN }) : '从未'}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Analysis Modal */}
            {selectedAnalysis && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-surface-muted">
                            <div>
                                <h3 className="text-lg font-bold text-text flex items-center">
                                    <Target className="mr-2 text-primary" size={20}/> {selectedCompetitorName}
                                </h3>
                                <p className="text-xs text-text-tertiary mt-0.5">运营策略深度拆解报告</p>
                            </div>
                            <button onClick={() => setSelectedAnalysis(null)} className="text-text-tertiary hover:text-text-secondary bg-surface p-1.5 rounded-full border border-border hover:bg-surface-muted transition-colors"><X size={18}/></button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6 bg-surface">
                            {selectedAnalysis.raw ? (
                                <div className="prose prose-sm max-w-none text-text-secondary whitespace-pre-wrap">
                                    {selectedAnalysis.raw}
                                </div>
                            ) : (
                                <>
                                    <div className="bg-gradient-to-br from-primary-subtle to-white p-5 rounded-xl border border-primary-subtle shadow-sm">
                                        <h4 className="text-sm font-bold text-primary mb-3 flex items-center">
                                            <Lightbulb size={18} className="mr-2 text-primary"/> 核心策略 (Content Strategy)
                                        </h4>
                                        <p className="text-text-secondary text-sm leading-relaxed">
                                            {selectedAnalysis.content_strategy || '分析中...'}
                                        </p>
                                    </div>

                                    <div>
                                        <h4 className="text-sm font-bold text-text mb-3 flex items-center">
                                            <Key size={18} className="mr-2 text-text-tertiary"/> 爆款关键词
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedAnalysis.keywords && typeof selectedAnalysis.keywords === 'string' ? selectedAnalysis.keywords.split(/[,，、]/).map((k: string, i: number) => (
                                                <span key={i} className="bg-surface-muted text-text-secondary px-3 py-1 rounded-full text-xs font-medium border border-border">
                                                    {k.trim()}
                                                </span>
                                            )) : <span className="text-text-tertiary text-sm">无</span>}
                                        </div>
                                    </div>

                                    <div className="bg-success-subtle p-5 rounded-xl border border-success-subtle">
                                        <h4 className="text-sm font-bold text-success mb-4 flex items-center">
                                            <TrendingUp size={18} className="mr-2 text-success"/> 抄作业建议 (Actionable Tips)
                                        </h4>
                                        {selectedAnalysis.strategies ? (
                                            <div className="space-y-3">
                                                {selectedAnalysis.strategies.map((strategy: any, index: number) => (
                                                    <div key={index} className="bg-surface p-4 rounded-lg border border-success-subtle shadow-sm">
                                                        <div className="text-success font-bold text-sm mb-2 flex items-start">
                                                            <span className="bg-success-subtle text-success rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 flex-shrink-0 mt-0.5">{index + 1}</span>
                                                            {strategy.tip}
                                                        </div>
                                                        <div className="pl-7 space-y-1.5">
                                                            <div className="text-xs text-text-secondary bg-surface-muted p-2 rounded">
                                                                <span className="font-bold text-text-secondary">推荐选题：</span>{strategy.suggested_topic}
                                                            </div>
                                                            <div className="text-xs text-text-secondary bg-surface-muted p-2 rounded">
                                                                <span className="font-bold text-text-secondary">参考标题：</span>{strategy.suggested_title}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-line">
                                                {selectedAnalysis.actionable_tips || '暂无建议'}
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="确认删除"
                footer={
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="px-4 py-2 text-text-secondary bg-surface-muted hover:bg-surface-hover rounded-lg text-sm font-medium transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleDelete}
                            className="px-4 py-2 text-primary-text bg-danger hover:bg-danger rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                            确认删除
                        </button>
                    </div>
                }
            >
                <div className="flex items-start p-2">
                    <div className="bg-danger-subtle p-2 rounded-full mr-4 flex-shrink-0">
                        <AlertCircle className="text-danger" size={24} />
                    </div>
                    <div>
                        <p className="text-text font-bold mb-1">您确定要删除该账号吗？</p>
                        <p className="text-text-tertiary text-sm leading-relaxed">
                            删除后，该账号的监控数据、历史笔记抓取记录和 AI 分析报告将全部被清除，且无法恢复。
                        </p>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
