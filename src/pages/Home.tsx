import axios from '@/lib/axios';
import {
    PenTool, Sparkles, TrendingUp, Plus, Activity, Eye, Heart,
    MessageCircle, AlertCircle, Clock, CheckCircle, ChevronDown,
    RefreshCw, User, ArrowUp, ArrowDown, Star, LayoutGrid, Hand,
    Zap, Users, AlertTriangle, Lightbulb, Calendar, Bell, Target,
    FileText, ExternalLink, Layers, Radio, ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import toast from 'react-hot-toast';
import { format, subDays, startOfDay } from 'date-fns';
import { HomePageSkeleton } from '../components/ui/Skeleton';
import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";

const FirstRunGuide = lazy(() => import('../components/FirstRunGuide'));

// ============================================================
// 类型定义
// ============================================================

interface SummaryStats {
    account_name: string;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_collects: number;
}

interface TaskStats {
    pending: number;
    failed: number;
    completed: number;
}

interface Account {
    id: number;
    nickname: string;
    is_active: boolean;
    status: 'ACTIVE' | 'EXPIRED' | 'UNKNOWN';
}

interface TrendData {
    value: number;
    trend: number; // percentage
    isPositive: boolean;
}

/**
 * 紧急任务条目类型
 */
interface UrgentTask {
    type: 'reply_comments' | 'anomaly_burst' | 'competitor_alert' | 'task_failed' | 'opportunity_pending' | 'draft_review';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    action_link: string;
    count: number;
}

/**
 * 今日行动流类型
 */
interface TodayActions {
    pending_opportunities: Array<{
        id: string;
        title: string;
        targetAudience: string;
        problem: string;
        createdAt?: string;
    }>;
    in_progress_packages: Array<{
        id: string;
        title: string;
        currentVersion: number;
        updatedAt?: string;
    }>;
    ready_to_publish_count: number;
    active_radar_watches_count: number;
}

/**
 * 数据摘要类型：昨日数据 + 变化百分比
 */
interface WorkbenchSummary {
    date_range: { start: string; end: string };
    reads_change: number;
    likes_change: number;
    comments_change: number;
    collects_change: number;
    followers_change: number;
    top_note_title: string;
    top_note_metric: string;
}

/**
 * 日历预览类型
 */
interface CalendarPreview {
    today_scheduled: number;
    this_week_remaining: number;
    next_deadline: string | null;
}

/**
 * 建议条目类型
 */
interface Suggestion {
    type: string;
    title: string;
    description: string;
    action_link: string;
}

/**
 * 工作台聚合数据
 */
interface WorkbenchData {
    urgent_tasks: UrgentTask[];
    today_actions?: TodayActions;
    summary: WorkbenchSummary | null;
    calendar_preview: CalendarPreview;
    suggestions: Suggestion[];
    account_name: string;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 根据任务类型返回对应图标组件
 */
const getTaskIcon = (type: UrgentTask['type']) => {
    switch (type) {
        case 'reply_comments':
            return MessageCircle;
        case 'anomaly_burst':
            return Zap;
        case 'competitor_alert':
            return Users;
        case 'task_failed':
            return AlertTriangle;
        case 'opportunity_pending':
            return Lightbulb;
        case 'draft_review':
            return FileText;
        default:
            return Bell;
    }
};

/**
 * 根据优先级返回颜色类名
 * high=红色 / medium=黄色 / low=灰色
 */
const getPriorityStyle = (priority: UrgentTask['priority']) => {
    switch (priority) {
        case 'high':
            return { badge: 'bg-danger-subtle text-danger', dot: 'bg-danger' };
        case 'medium':
            return { badge: 'bg-warning-subtle text-warning', dot: 'bg-warning' };
        case 'low':
            return { badge: 'bg-surface-muted text-text-tertiary', dot: 'bg-text-tertiary' };
        default:
            return { badge: 'bg-surface-muted text-text-tertiary', dot: 'bg-text-tertiary' };
    }
};

/**
 * 优先级中文标签映射
 */
const getPriorityLabel = (priority: UrgentTask['priority']) => {
    switch (priority) {
        case 'high':
            return '高优';
        case 'medium':
            return '中优';
        case 'low':
            return '一般';
        default:
            return '一般';
    }
};

// ============================================================
// 首页「今日工作台」组件
// ============================================================

export default function Home() {
    const user = useAuthStore(state => state.user);

    // -- 原有仪表盘数据 --
    const [summary, setSummary] = useState<SummaryStats | null>(null);
    const [rawHistory, setRawHistory] = useState<any[]>([]);
    const [tasks, setTasks] = useState<TaskStats>({ pending: 0, failed: 0, completed: 0 });
    const [loading, setLoading] = useState(true);

    // -- 账号切换状态 --
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [activeAccount, setActiveAccount] = useState<Account | null>(null);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // -- 图表相关 --
    const [timeRange, setTimeRange] = useState<'7d' | '30d'>('7d');
    const [chartMetric, setChartMetric] = useState<'views' | 'likes' | 'comments'>('views');

    // -- 工作台数据 --
    const [workbenchData, setWorkbenchData] = useState<WorkbenchData | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetchDashboardData(controller.signal);
        fetchAccounts();
        fetchWorkbenchData(controller.signal);
        return () => controller.abort();
    }, []);

    // ----------------------------------------------------------
    // 数据获取函数
    // ----------------------------------------------------------

    const fetchAccounts = async () => {
        try {
            const res = await axios.get('/api/accounts');
            setAccounts(res.data);
            const active = res.data.find((a: Account) => a.is_active);
            if (active) setActiveAccount(active);
        } catch (_e) {
            toast.error('账号列表加载失败');
        }
    };

    const fetchDashboardData = async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const [summaryRes, historyRes, tasksRes] = await Promise.all([
                axios.get('/api/analytics/summary', { signal }),
                axios.get('/api/analytics/history', { signal }),
                axios.get('/api/tasks/stats', { signal })
            ]);

            setSummary(summaryRes.data);
            setRawHistory(historyRes.data);
            if (tasksRes.data) setTasks(tasksRes.data);
        } catch (error: any) {
            if (axios.isCancel(error)) return;
            toast.error('获取数据失败');
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    };

    /**
     * 获取今日工作台聚合数据
     */
    const fetchWorkbenchData = async (signal?: AbortSignal) => {
        try {
            const url = activeAccount?.id 
                ? `/api/workbench/today?accountId=${activeAccount.id}`
                : '/api/workbench/today';
            const res = await axios.get(url, { signal });
            setWorkbenchData(res.data?.data ?? null);
        } catch (error: any) {
            if (axios.isCancel(error)) return;
            // 工作台数据异常不阻塞整体页面
            console.error('工作台数据加载失败:', error);
        }
    };

    const handleSwitchAccount = async (account: Account) => {
        if (account.id === activeAccount?.id) {
            setShowAccountMenu(false);
            return;
        }

        try {
            await axios.post(`/api/accounts/${account.id}/active`);
            setActiveAccount(account);
            setAccounts(accounts.map(a => ({ ...a, is_active: a.id === account.id })));
            toast.success(`已切换至账号: ${account.nickname}`);
            fetchDashboardData();
            fetchWorkbenchData();
        } catch (_e) {
            toast.error('切换账号失败');
        } finally {
            setShowAccountMenu(false);
        }
    };

    const handleRefreshData = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);

        try {
            await axios.post('/api/analytics/refresh');
            toast.success('数据同步任务已提交');
        } catch (e: any) {
            toast.error(e.response?.data?.error || '同步请求失败');
        } finally {
            setIsRefreshing(false);
        }
    };

    // ----------------------------------------------------------
    // 图表数据处理（保持原有逻辑不变）
    // ----------------------------------------------------------
    const { chartData, metrics, totals } = useMemo(() => {
        if (!rawHistory || rawHistory.length === 0) {
            return { chartData: [], metrics: null, totals: null };
        }

        const days = timeRange === '7d' ? 7 : 30;
        const today = startOfDay(new Date());

        const dailyMap = new Map();

        for (let i = 0; i < days * 2; i++) {
            const d = subDays(today, i);
            const dateStr = format(d, 'yyyy-MM-dd');
            dailyMap.set(dateStr, { views: 0, likes: 0, comments: 0, collects: 0, date: dateStr });
        }

        // 去重：每天每篇笔记只保留最新快照
        const uniqueDailyNotes = new Map<string, any>();

        rawHistory.forEach((item: any) => {
            const dateStr = (item.record_time || '').replace(' ', 'T').split('T')[0];
            if (!dateStr) return;
            const key = `${dateStr}_${item.note_id}`;

            if (!uniqueDailyNotes.has(key)) {
                uniqueDailyNotes.set(key, item);
            } else {
                const existing = uniqueDailyNotes.get(key);
                if (new Date(item.record_time) > new Date(existing.record_time)) {
                    uniqueDailyNotes.set(key, item);
                }
            }
        });

        uniqueDailyNotes.forEach((item) => {
            const dateStr = (item.record_time || '').replace(' ', 'T').split('T')[0];
            if (dailyMap.has(dateStr)) {
                const entry = dailyMap.get(dateStr);
                entry.views += (item.views || 0);
                entry.likes += (item.likes || 0);
                entry.comments += (item.comments || 0);
                entry.collects += (item.collects || 0);
            }
        });

        const allDailyData = Array.from(dailyMap.values()).sort(
            (a: any, b: any) => a.date.localeCompare(b.date)
        );

        const filledCurrentData = allDailyData.slice(-days);
        const filledPrevData = allDailyData.slice(-days * 2, -days);

        const latestDateData = filledCurrentData[filledCurrentData.length - 1] || {
            views: 0, likes: 0, comments: 0, collects: 0
        };
        const startDateData = filledCurrentData[0] || {
            views: 0, likes: 0, comments: 0, collects: 0
        };

        const prevLatestData = filledPrevData[filledPrevData.length - 1] || {
            views: 0, likes: 0, comments: 0, collects: 0
        };
        const prevStartData = filledPrevData[0] || {
            views: 0, likes: 0, comments: 0, collects: 0
        };

        const getGrowth = (latest: any, start: any, key: string) =>
            Math.max(0, (latest[key] || 0) - (start[key] || 0));

        const currentGrowth = {
            views: getGrowth(latestDateData, startDateData, 'views'),
            likes: getGrowth(latestDateData, startDateData, 'likes'),
            comments: getGrowth(latestDateData, startDateData, 'comments'),
            collects: getGrowth(latestDateData, startDateData, 'collects'),
        };

        const prevGrowth = {
            views: getGrowth(prevLatestData, prevStartData, 'views'),
            likes: getGrowth(prevLatestData, prevStartData, 'likes'),
            comments: getGrowth(prevLatestData, prevStartData, 'comments'),
            collects: getGrowth(prevLatestData, prevStartData, 'collects'),
        };

        const currentStats = {
            views: latestDateData.views || 0,
            likes: latestDateData.likes || 0,
            comments: latestDateData.comments || 0,
            collects: latestDateData.collects || 0,
        };

        const calcTrend = (currGrowth: number, prevGr: number): TrendData => {
            if (prevGr === 0)
                return { value: currGrowth, trend: currGrowth > 0 ? 100 : 0, isPositive: true };
            const change = ((currGrowth - prevGr) / prevGr) * 100;
            return {
                value: currGrowth,
                trend: Math.abs(change),
                isPositive: change >= 0
            };
        };

        return {
            chartData: filledCurrentData.map(d => ({
                ...d,
                displayDate: format(new Date(d.date), 'MM-dd')
            })),
            metrics: {
                views: calcTrend(currentGrowth.views, prevGrowth.views),
                likes: calcTrend(currentGrowth.likes, prevGrowth.likes),
                comments: calcTrend(currentGrowth.comments, prevGrowth.comments),
                collects: calcTrend(currentGrowth.collects, prevGrowth.collects),
            },
            totals: currentStats
        };
    }, [rawHistory, timeRange]);

    // ----------------------------------------------------------
    // 子组件：趋势指示图标
    // ----------------------------------------------------------
    const TrendIcon = useCallback(({ isPositive }: { isPositive: boolean }) => (
        isPositive
            ? <ArrowUp size={12} className="mr-1" />
            : <ArrowDown size={12} className="mr-1" />
    ), []);

    // ----------------------------------------------------------
    // 子组件：数据指标卡片
    // ----------------------------------------------------------
    const MetricCard = ({ title, icon: Icon, color, data, total, active, onClick }: any) => (
        <div
            onClick={onClick}
            className={`bg-surface p-5 rounded-xl border cursor-pointer transition-all duration-200 ${
                active
                    ? 'border-primary shadow-md ring-1 ring-primary/20'
                    : 'border-border shadow-sm hover:border-border-strong hover:shadow'
            }`}
        >
            <div className="flex justify-between items-start mb-3">
                <div className={`p-2 rounded-lg ${color}`}>
                    <Icon size={20} />
                </div>
                {data && (
                    <div
                        className={`flex items-center text-xs font-medium ${
                            data.isPositive
                                ? 'text-success bg-success-subtle'
                                : 'text-danger bg-danger-subtle'
                        } px-2 py-1 rounded-full`}
                        title="周期增长趋势"
                    >
                        <TrendIcon isPositive={data.isPositive} />
                        {data.trend.toFixed(1)}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-sm text-text-secondary mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-text">
                    {total ? total.toLocaleString() : '-'}
                </h3>
                {data && (
                    <p className="text-xs text-text-tertiary mt-1">
                        本期新增: +{data.value.toLocaleString()}
                    </p>
                )}
            </div>
        </div>
    );

    // ============================================================
    // 渲染
    // ============================================================

    return (
        <div className="space-y-6">
            {loading ? (
                <HomePageSkeleton />
            ) : (
                <>
                    <Suspense fallback={<div className="h-32 bg-surface rounded-xl border border-border animate-pulse mb-6" />}>
                        <FirstRunGuide />
                    </Suspense>

                    {/* ================================================ */}
                    {/* 1. 顶部 Header 区（保持原有欢迎语 + 账号切换） */}
                    {/* ================================================ */}
                    <div className="bg-surface rounded-2xl p-6 shadow-sm border border-border">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-text flex items-center">
                                    早安, {user?.username || '运营官'}
                                    <Hand className="ml-2 text-warning" size={28} />
                                </h1>
                                <p className="text-text-secondary text-sm mt-1">
                                    当前展示{' '}
                                    <span className="font-medium text-text">
                                        {activeAccount?.nickname || workbenchData?.account_name}
                                    </span>{' '}
                                    的数据概览。
                                </p>
                            </div>

                            <div className="flex items-center space-x-3">
                                {/* 账号切换器 */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowAccountMenu(!showAccountMenu)}
                                        className="flex items-center space-x-2 bg-surface-muted border border-border px-4 py-2 rounded-lg hover:bg-surface-hover transition-colors"
                                    >
                                        <User size={16} className="text-text-tertiary" />
                                        <span className="text-sm font-medium text-text-secondary max-w-[120px] truncate">
                                            {activeAccount ? activeAccount.nickname : '选择账号'}
                                        </span>
                                        <ChevronDown size={14} className="text-text-tertiary" />
                                    </button>

                                    {showAccountMenu && (
                                        <div className="absolute right-0 mt-2 w-64 bg-surface rounded-xl shadow-xl border border-border z-50 py-2 max-h-80 overflow-y-auto ring-1 ring-black/5">
                                            <div className="px-4 py-2 border-b border-border mb-1">
                                                <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                                                    切换账号
                                                </span>
                                            </div>
                                            {accounts.length > 0 ? (
                                                accounts.map(acc => (
                                                    <button
                                                        key={acc.id}
                                                        onClick={() => handleSwitchAccount(acc)}
                                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-surface-muted transition-colors ${
                                                            acc.is_active
                                                                ? 'bg-primary-subtle text-primary'
                                                                : 'text-text-secondary'
                                                        }`}
                                                    >
                                                        <div className="flex items-center overflow-hidden">
                                                            <div
                                                                className={`w-2 h-2 rounded-full mr-2 ${
                                                                    acc.is_active ? 'bg-primary' : 'bg-text-tertiary'
                                                                }`}
                                                            ></div>
                                                            <span className="truncate">{acc.nickname}</span>
                                                        </div>
                                                        {acc.status === 'EXPIRED' && (
                                                            <span className="text-[10px] text-danger bg-danger-subtle px-1.5 py-0.5 rounded border border-danger/20">
                                                                失效
                                                            </span>
                                                        )}
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-4 py-8 text-center">
                                                    <p className="text-sm text-text-secondary mb-2">暂无账号</p>
                                                    <Link
                                                        to="/accounts"
                                                        className="text-sm text-primary hover:text-primary-hover font-medium"
                                                    >
                                                        去添加
                                                    </Link>
                                                </div>
                                            )}
                                            <div className="border-t border-border mt-1 pt-1">
                                                <Link
                                                    to="/accounts"
                                                    className="block w-full text-left px-4 py-2 text-xs text-text-tertiary hover:text-primary hover:bg-surface-muted transition-colors"
                                                >
                                                    管理所有账号 &rarr;
                                                </Link>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleRefreshData}
                                    disabled={isRefreshing}
                                    className={`flex items-center justify-center p-2.5 border border-border rounded-lg hover:bg-surface-muted transition-colors ${
                                        isRefreshing ? 'text-primary bg-primary-subtle' : 'text-text-secondary'
                                    }`}
                                    title="同步最新数据"
                                >
                                    <RefreshCw
                                        size={18}
                                        className={isRefreshing ? 'animate-spin' : ''}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ================================================ */}
                    {/* 1.5 核心行动流主路径 (Today Actions) */}
                    {/* ================================================ */}
                    <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <Activity className="text-primary w-5 h-5" />
                                <h2 className="text-base font-bold text-text">今日主行动流 (Today Actions)</h2>
                                <span className="text-xs text-text-tertiary">按照“雷达痛点 &rarr; 选题决策 &rarr; 内容版本 &rarr; 人工发审”单兵闭环推进</span>
                            </div>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary-subtle text-primary">
                                P2.2 闭环工作台
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* 1. 待决策选题卡 */}
                            <Link
                                to="/opportunities"
                                className="p-4 rounded-xl border border-border bg-surface-muted hover:bg-surface-hover hover:border-warning/50 transition-all flex flex-col justify-between group"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-warning-subtle text-warning flex items-center justify-center">
                                            <Lightbulb size={18} />
                                        </div>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warning-subtle text-warning">
                                            {workbenchData?.today_actions?.pending_opportunities.length ?? 0} 个待决策
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-bold text-text group-hover:text-primary transition-colors line-clamp-1">
                                        {workbenchData?.today_actions?.pending_opportunities[0]?.title || '暂无待决策选题'}
                                    </h3>
                                    <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                                        {workbenchData?.today_actions?.pending_opportunities[0]?.problem || '来自用户真实痛点与评论区原话提取'}
                                    </p>
                                </div>
                                <div className="pt-3 mt-2 border-t border-border flex items-center justify-between text-xs text-warning font-medium">
                                    <span>去选题池决策</span>
                                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>

                            {/* 2. 制作中内容包 */}
                            <Link
                                to="/packages"
                                className="p-4 rounded-xl border border-border bg-surface-muted hover:bg-surface-hover hover:border-danger/50 transition-all flex flex-col justify-between group"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-danger-subtle text-danger flex items-center justify-center">
                                            <Layers size={18} />
                                        </div>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-danger-subtle text-danger">
                                            {workbenchData?.today_actions?.in_progress_packages.length ?? 0} 个内容包
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-bold text-text group-hover:text-primary transition-colors line-clamp-1">
                                        {workbenchData?.today_actions?.in_progress_packages[0]?.title || '暂无活跃内容包'}
                                    </h3>
                                    <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                                        {workbenchData?.today_actions?.in_progress_packages[0]
                                            ? `当前版本 v${workbenchData.today_actions.in_progress_packages[0].currentVersion} · 包含论点卡与脚本`
                                            : '多维结构化稿件与版本历史树'}
                                    </p>
                                </div>
                                <div className="pt-3 mt-2 border-t border-border flex items-center justify-between text-xs text-danger font-medium">
                                    <span>去版本工作台</span>
                                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>

                            {/* 3. 待发布确认包 */}
                            <Link
                                to="/drafts"
                                className="p-4 rounded-xl border border-border bg-surface-muted hover:bg-surface-hover hover:border-primary/50 transition-all flex flex-col justify-between group"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-primary-subtle text-primary flex items-center justify-center">
                                            <FileText size={18} />
                                        </div>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary-subtle text-primary">
                                            {workbenchData?.today_actions?.ready_to_publish_count ?? 0} 篇待核验
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-bold text-text group-hover:text-primary transition-colors line-clamp-1">
                                        待人工确认草稿
                                    </h3>
                                    <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                                        P0 安全发布门禁：强制人工核验（confirmedByUser: true），杜绝盲目重发
                                    </p>
                                </div>
                                <div className="pt-3 mt-2 border-t border-border flex items-center justify-between text-xs text-primary font-medium">
                                    <span>去草稿箱发审</span>
                                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>

                            {/* 4. 活跃需求雷达 */}
                            <Link
                                to="/radar"
                                className="p-4 rounded-xl border border-border bg-surface-muted hover:bg-surface-hover hover:border-indigo-500/50 transition-all flex flex-col justify-between group"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                                            <Radio size={18} />
                                        </div>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300">
                                            {workbenchData?.today_actions?.active_radar_watches_count ?? 0} 个监控项
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-bold text-text group-hover:text-primary transition-colors line-clamp-1">
                                        需求雷达监听中
                                    </h3>
                                    <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                                        持续监听全网高频求助、客诉与竞品吐槽，自动合成高胜率机会
                                    </p>
                                </div>
                                <div className="pt-3 mt-2 border-t border-border flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                                    <span>去雷达工作台</span>
                                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>
                        </div>
                    </div>

                    {/* ================================================ */}
                    {/* 2. 紧急任务 + 日历预览（双列布局） */}
                    {/* ================================================ */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ---- 紧急任务卡片 ---- */}
                        <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-text flex items-center">
                                    <Bell className="mr-2 text-danger" size={18} />
                                    待处理紧急事项
                                </h3>
                                {workbenchData?.urgent_tasks && workbenchData.urgent_tasks.length > 0 && (
                                    <span className="text-xs font-medium text-danger bg-danger-subtle px-2 py-1 rounded-full">
                                        {workbenchData.urgent_tasks.length} 项
                                    </span>
                                )}
                            </div>

                            {!workbenchData || workbenchData.urgent_tasks.length === 0 ? (
                                <div className="text-center py-8">
                                    <CheckCircle size={32} className="text-text-tertiary mx-auto mb-2" />
                                    <p className="text-sm text-text-tertiary">暂无紧急事项，一切正常</p>
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                                    {workbenchData.urgent_tasks.map((task, idx) => {
                                        const Icon = getTaskIcon(task.type);
                                        const priorityStyle = getPriorityStyle(task.priority);
                                        return (
                                            <Link
                                                key={`${task.type}-${idx}`}
                                                to={task.action_link}
                                                className="flex items-start gap-3 p-3 rounded-lg bg-surface-muted hover:bg-surface-hover transition-colors group"
                                            >
                                                {/* 类型图标 */}
                                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-border group-hover:border-border-strong transition-colors">
                                                    <Icon size={18} className="text-text-secondary" />
                                                </div>
                                                {/* 内容区 */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-sm font-medium text-text truncate">
                                                            {task.title}
                                                        </span>
                                                        <span
                                                            className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityStyle.badge}`}
                                                        >
                                                            {getPriorityLabel(task.priority)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-text-tertiary truncate">
                                                        {task.description}
                                                    </p>
                                                </div>
                                                {/* 数量徽标 + 跳转箭头 */}
                                                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                                    {task.count > 0 && (
                                                        <span className="text-xs font-bold text-text bg-surface px-1.5 py-0.5 rounded-md border border-border min-w-[24px] text-center">
                                                            {task.count}
                                                        </span>
                                                    )}
                                                    <ExternalLink
                                                        size={12}
                                                        className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                                                    />
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ---- 日历预览卡片 ---- */}
                        <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-text flex items-center">
                                    <Calendar className="mr-2 text-primary" size={18} />
                                    发布日历预览
                                </h3>
                                <Link
                                    to="/tasks"
                                    className="text-xs text-primary hover:text-primary-hover font-medium flex items-center gap-1"
                                >
                                    查看全部 <ExternalLink size={10} />
                                </Link>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {/* 今日已排期 */}
                                <div className="bg-primary-subtle rounded-lg p-4 text-center">
                                    <div className="text-2xl font-bold text-primary mb-1">
                                        {workbenchData?.calendar_preview?.today_scheduled ?? 0}
                                    </div>
                                    <p className="text-xs text-text-secondary">今日已排期</p>
                                </div>
                                {/* 本周剩余 */}
                                <div className="bg-surface-muted rounded-lg p-4 text-center">
                                    <div className="text-2xl font-bold text-text mb-1">
                                        {workbenchData?.calendar_preview?.this_week_remaining ?? 0}
                                    </div>
                                    <p className="text-xs text-text-tertiary">本周待发布</p>
                                </div>
                            </div>

                            {/* 下一个截止时间和待排期草稿 */}
                            <div className="space-y-3">
                                {workbenchData?.calendar_preview?.next_deadline ? (
                                    <div className="flex items-center gap-3 p-3 bg-warning-subtle rounded-lg">
                                        <Clock size={16} className="text-warning flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-xs text-text-secondary">下一个截止时间</p>
                                            <p className="text-sm font-medium text-text truncate">
                                                {workbenchData.calendar_preview.next_deadline}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 p-3 bg-surface-muted rounded-lg">
                                        <Clock size={16} className="text-text-tertiary flex-shrink-0" />
                                        <p className="text-xs text-text-tertiary">暂无截止时间安排</p>
                                    </div>
                                )}

                                {/* 草稿数量提示 */}
                                <div className="flex items-center gap-3 p-3 bg-surface-muted rounded-lg">
                                    <FileText size={16} className="text-text-tertiary flex-shrink-0" />
                                    <p className="text-xs text-text-secondary">
                                        有{' '}
                                        <span className="font-bold text-text">
                                            {workbenchData?.urgent_tasks?.filter(
                                                t => t.type === 'task_failed'
                                            ).length ?? 0}
                                        </span>{' '}
                                        篇草稿等待排期
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ================================================ */}
                    {/* 3. 昨日数据摘要卡片 */}
                    {/* ================================================ */}
                    {workbenchData?.summary && (
                        <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-text flex items-center">
                                    <Target className="mr-2 text-success" size={18} />
                                    昨日数据表现
                                </h3>
                                <span className="text-xs text-text-tertiary">
                                    {workbenchData.summary.date_range.start} ~{' '}
                                    {workbenchData.summary.date_range.end}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                {/* 阅读变化 */}
                                <div className="bg-surface-muted rounded-lg p-3 text-center">
                                    <p className="text-xs text-text-tertiary mb-1">阅读</p>
                                    <div className="flex items-center justify-center gap-1">
                                        {workbenchData.summary.reads_change >= 0 ? (
                                            <ArrowUp size={12} className="text-success" />
                                        ) : (
                                            <ArrowDown size={12} className="text-danger" />
                                        )}
                                        <span
                                            className={`text-sm font-bold ${
                                                workbenchData.summary.reads_change >= 0
                                                    ? 'text-success'
                                                    : 'text-danger'
                                            }`}
                                        >
                                            {workbenchData.summary.reads_change >= 0 ? '+' : ''}
                                            {workbenchData.summary.reads_change}%
                                        </span>
                                    </div>
                                </div>
                                {/* 点赞变化 */}
                                <div className="bg-surface-muted rounded-lg p-3 text-center">
                                    <p className="text-xs text-text-tertiary mb-1">点赞</p>
                                    <div className="flex items-center justify-center gap-1">
                                        {workbenchData.summary.likes_change >= 0 ? (
                                            <ArrowUp size={12} className="text-success" />
                                        ) : (
                                            <ArrowDown size={12} className="text-danger" />
                                        )}
                                        <span
                                            className={`text-sm font-bold ${
                                                workbenchData.summary.likes_change >= 0
                                                    ? 'text-success'
                                                    : 'text-danger'
                                            }`}
                                        >
                                            {workbenchData.summary.likes_change >= 0 ? '+' : ''}
                                            {workbenchData.summary.likes_change}%
                                        </span>
                                    </div>
                                </div>
                                {/* 评论变化 */}
                                <div className="bg-surface-muted rounded-lg p-3 text-center">
                                    <p className="text-xs text-text-tertiary mb-1">评论</p>
                                    <div className="flex items-center justify-center gap-1">
                                        {workbenchData.summary.comments_change >= 0 ? (
                                            <ArrowUp size={12} className="text-success" />
                                        ) : (
                                            <ArrowDown size={12} className="text-danger" />
                                        )}
                                        <span
                                            className={`text-sm font-bold ${
                                                workbenchData.summary.comments_change >= 0
                                                    ? 'text-success'
                                                    : 'text-danger'
                                            }`}
                                        >
                                            {workbenchData.summary.comments_change >= 0 ? '+' : ''}
                                            {workbenchData.summary.comments_change}%
                                        </span>
                                    </div>
                                </div>
                                {/* 收藏变化 */}
                                <div className="bg-surface-muted rounded-lg p-3 text-center">
                                    <p className="text-xs text-text-tertiary mb-1">收藏</p>
                                    <div className="flex items-center justify-center gap-1">
                                        {workbenchData.summary.collects_change >= 0 ? (
                                            <ArrowUp size={12} className="text-success" />
                                        ) : (
                                            <ArrowDown size={12} className="text-danger" />
                                        )}
                                        <span
                                            className={`text-sm font-bold ${
                                                workbenchData.summary.collects_change >= 0
                                                    ? 'text-success'
                                                    : 'text-danger'
                                            }`}
                                        >
                                            {workbenchData.summary.collects_change >= 0 ? '+' : ''}
                                            {workbenchData.summary.collects_change}%
                                        </span>
                                    </div>
                                </div>
                                {/* 粉丝变化 */}
                                <div className="bg-surface-muted rounded-lg p-3 text-center">
                                    <p className="text-xs text-text-tertiary mb-1">粉丝</p>
                                    <div className="flex items-center justify-center gap-1">
                                        {workbenchData.summary.followers_change >= 0 ? (
                                            <ArrowUp size={12} className="text-success" />
                                        ) : (
                                            <ArrowDown size={12} className="text-danger" />
                                        )}
                                        <span
                                            className={`text-sm font-bold ${
                                                workbenchData.summary.followers_change >= 0
                                                    ? 'text-success'
                                                    : 'text-danger'
                                            }`}
                                        >
                                            {workbenchData.summary.followers_change >= 0 ? '+' : ''}
                                            {workbenchData.summary.followers_change}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 最佳笔记提示 */}
                            {workbenchData.summary.top_note_title && (
                                <div className="mt-4 flex items-center gap-2 p-3 bg-success-subtle rounded-lg">
                                    <Target size={14} className="text-success flex-shrink-0" />
                                    <p className="text-xs text-text-secondary">
                                        最佳笔记「{workbenchData.summary.top_note_title}」
                                        —— {workbenchData.summary.top_note_metric}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ================================================ */}
                    {/* 4. 核心数据分析 + 趋势图表（保持原有完整逻辑） */}
                    {/* ================================================ */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-text flex items-center">
                                <LayoutGrid className="mr-2 text-primary" size={20} />
                                核心数据 (Analytics)
                            </h2>
                            <div className="flex space-x-2">
                                <button
                                    onClick={handleRefreshData}
                                    disabled={isRefreshing}
                                    className={`flex items-center px-4 py-2 bg-surface border border-border rounded-md text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors ${
                                        isRefreshing ? 'opacity-70 cursor-wait' : ''
                                    }`}
                                >
                                    <RefreshCw
                                        size={16}
                                        className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
                                    />
                                    {isRefreshing ? '同步中...' : '同步数据'}
                                </button>
                                <div className="flex bg-surface rounded-md shadow-sm border border-border">
                                    <button
                                        onClick={() => setTimeRange('7d')}
                                        className={`px-3 py-2 text-sm font-medium rounded-l-md ${
                                            timeRange === '7d'
                                                ? 'bg-primary-subtle text-primary'
                                                : 'text-text-secondary hover:bg-surface-muted'
                                        }`}
                                    >
                                        近7天
                                    </button>
                                    <div className="w-px bg-border"></div>
                                    <button
                                        onClick={() => setTimeRange('30d')}
                                        className={`px-3 py-2 text-sm font-medium rounded-r-md ${
                                            timeRange === '30d'
                                                ? 'bg-primary-subtle text-primary'
                                                : 'text-text-secondary hover:bg-surface-muted'
                                        }`}
                                    >
                                        近30天
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 指标卡片网格 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <MetricCard
                                title="阅读量 (Views)"
                                icon={Eye}
                                color="bg-primary-subtle text-primary"
                                data={metrics?.views}
                                total={summary?.total_views ?? totals?.views}
                                active={chartMetric === 'views'}
                                onClick={() => setChartMetric('views')}
                            />
                            <MetricCard
                                title="点赞数 (Likes)"
                                icon={Heart}
                                color="bg-danger-subtle text-danger"
                                data={metrics?.likes}
                                total={summary?.total_likes ?? totals?.likes}
                                active={chartMetric === 'likes'}
                                onClick={() => setChartMetric('likes')}
                            />
                            <MetricCard
                                title="评论数 (Comments)"
                                icon={MessageCircle}
                                color="bg-warning-subtle text-warning"
                                data={metrics?.comments}
                                total={summary?.total_comments ?? totals?.comments}
                                active={chartMetric === 'comments'}
                                onClick={() => setChartMetric('comments')}
                            />
                            <MetricCard
                                title="收藏数 (Collects)"
                                icon={Star}
                                color="bg-success-subtle text-success"
                                data={metrics?.collects}
                                total={summary?.total_collects ?? totals?.collects}
                                active={false}
                                onClick={() => {}}
                            />
                        </div>

                        {/* 趋势图表 */}
                        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm mb-8">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-base font-semibold text-text">
                                        {chartMetric === 'views' && '阅读趋势'}
                                        {chartMetric === 'likes' && '点赞趋势'}
                                        {chartMetric === 'comments' && '评论趋势'}
                                    </h3>
                                    <p className="text-xs text-text-tertiary mt-1">
                                        数据来源：{timeRange === '7d' ? '过去7天' : '过去30天'}每日统计
                                    </p>
                                </div>
                            </div>
                            <div
                                className="h-[300px] w-full"
                                key={`chart-${chartMetric}-${timeRange}`}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={chartData}
                                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                    >
                                        <defs>
                                            <linearGradient
                                                id="colorValue"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="5%"
                                                    stopColor="var(--primary)"
                                                    stopOpacity={0.3}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor="var(--primary)"
                                                    stopOpacity={0}
                                                />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={false}
                                            stroke="var(--border)"
                                        />
                                        <XAxis
                                            dataKey="displayDate"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                                            dy={10}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '8px',
                                                border: 'none',
                                                boxShadow:
                                                    '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                            }}
                                            cursor={{
                                                stroke: 'var(--primary)',
                                                strokeWidth: 1,
                                                strokeDasharray: '4 4'
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey={chartMetric}
                                            stroke="var(--primary)"
                                            strokeWidth={3}
                                            fill="url(#colorValue)"
                                            isAnimationActive={true}
                                            animationDuration={800}
                                            dot={false}
                                            activeDot={{
                                                r: 6,
                                                strokeWidth: 0,
                                                fill: 'var(--primary)'
                                            }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* ================================================ */}
                    {/* 5. 运营建议 + 快速操作（双列布局） */}
                    {/* ================================================ */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ---- 运营建议卡片 ---- */}
                        <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
                            <div className="flex items-center mb-4">
                                <h3 className="font-bold text-text flex items-center">
                                    <Lightbulb className="mr-2 text-warning" size={18} />
                                    运营建议
                                </h3>
                            </div>

                            {!workbenchData?.suggestions ||
                            workbenchData.suggestions.length === 0 ? (
                                <div className="text-center py-8">
                                    <Lightbulb
                                        size={32}
                                        className="text-text-tertiary mx-auto mb-2"
                                    />
                                    <p className="text-sm text-text-tertiary">
                                        暂无建议，继续加油
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                                    {workbenchData.suggestions.map((suggestion, idx) => (
                                        <Link
                                            key={`${suggestion.type}-${idx}`}
                                            to={suggestion.action_link}
                                            className="flex items-start gap-3 p-3 rounded-lg bg-surface-muted hover:bg-surface-hover transition-colors group"
                                        >
                                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-warning-subtle flex items-center justify-center">
                                                <Lightbulb
                                                    size={16}
                                                    className="text-warning"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-text truncate">
                                                    {suggestion.title}
                                                </p>
                                                <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                                                    {suggestion.description}
                                                </p>
                                            </div>
                                            <ExternalLink
                                                size={12}
                                                className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
                                            />
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ---- 快速操作 + 系统状态 ---- */}
                        <div className="space-y-6">
                            {/* 系统状态 */}
                            <div className="bg-surface p-5 rounded-xl border border-border shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-text flex items-center">
                                        <Activity className="mr-2 text-primary" size={18} />
                                        系统状态
                                    </h3>
                                    <span
                                        className={`text-xs px-2 py-1 rounded-full ${
                                            tasks.failed > 0
                                                ? 'bg-danger-subtle text-danger'
                                                : 'bg-success-subtle text-success'
                                        }`}
                                    >
                                        {tasks.failed > 0 ? '需关注' : '运行正常'}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <Link
                                        to="/tasks"
                                        className="flex items-center justify-between p-3 bg-surface-muted rounded-lg hover:bg-surface-hover transition-colors"
                                    >
                                        <div className="flex items-center">
                                            <div className="w-8 h-8 rounded-full bg-primary-subtle flex items-center justify-center text-primary mr-3">
                                                <Clock size={16} />
                                            </div>
                                            <span className="text-sm text-text-secondary">
                                                待处理任务
                                            </span>
                                        </div>
                                        <span className="font-bold text-text">
                                            {tasks.pending}
                                        </span>
                                    </Link>
                                    <Link
                                        to="/tasks"
                                        className="flex items-center justify-between p-3 bg-surface-muted rounded-lg hover:bg-surface-hover transition-colors"
                                    >
                                        <div className="flex items-center">
                                            <div className="w-8 h-8 rounded-full bg-success-subtle flex items-center justify-center text-success mr-3">
                                                <CheckCircle size={16} />
                                            </div>
                                            <span className="text-sm text-text-secondary">
                                                已完成任务
                                            </span>
                                        </div>
                                        <span className="font-bold text-text">
                                            {tasks.completed}
                                        </span>
                                    </Link>
                                    <Link
                                        to="/tasks"
                                        className="flex items-center justify-between p-3 bg-surface-muted rounded-lg hover:bg-surface-hover transition-colors"
                                    >
                                        <div className="flex items-center">
                                            <div className="w-8 h-8 rounded-full bg-danger-subtle flex items-center justify-center text-danger mr-3">
                                                <AlertCircle size={16} />
                                            </div>
                                            <span className="text-sm text-text-secondary">
                                                失败任务
                                            </span>
                                        </div>
                                        <span className="font-bold text-text">
                                            {tasks.failed}
                                        </span>
                                    </Link>
                                </div>
                            </div>

                            {/* 快速开始 */}
                            <div>
                                <h3 className="font-bold text-text mb-4 flex items-center">
                                    <Sparkles className="mr-2 text-warning" size={18} />
                                    快速开始
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <Link
                                        to="/generate"
                                        className="group p-4 bg-surface border border-danger/20 rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center"
                                    >
                                        <div className="w-12 h-12 bg-danger-subtle text-danger rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                                            <Plus size={24} />
                                        </div>
                                        <span className="text-sm font-bold text-text">
                                            写篇笔记
                                        </span>
                                        <span className="text-xs text-text-tertiary mt-1">
                                            AI 辅助创作
                                        </span>
                                    </Link>

                                    <Link
                                        to="/trends"
                                        className="group p-4 bg-surface border border-border rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center"
                                    >
                                        <div className="w-10 h-10 bg-warning-subtle text-warning rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                            <TrendingUp size={20} />
                                        </div>
                                        <span className="text-sm font-medium text-text-secondary">
                                            查看热搜
                                        </span>
                                    </Link>

                                    <Link
                                        to="/persona"
                                        className="group p-4 bg-surface border border-border rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center"
                                    >
                                        <div className="w-10 h-10 bg-primary-subtle text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                            <PenTool size={20} />
                                        </div>
                                        <span className="text-sm font-medium text-text-secondary">
                                            人设管理
                                        </span>
                                    </Link>

                                    <Link
                                        to="/analytics"
                                        className="group p-4 bg-surface border border-border rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center"
                                    >
                                        <div className="w-10 h-10 bg-primary-subtle text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                            <Activity size={20} />
                                        </div>
                                        <span className="text-sm font-medium text-text-secondary">
                                            完整看板
                                        </span>
                                    </Link>
                                </div>

                                {/* 运营小贴士 */}
                                <div className="mt-4 bg-primary-subtle rounded-xl p-4 flex items-start">
                                    <div className="bg-primary-subtle p-2 rounded-lg text-primary mr-3">
                                        <Sparkles size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-text">
                                            运营小贴士
                                        </h4>
                                        <p className="text-xs text-text-secondary mt-1">
                                            保持每周 3-5 篇的更新频率，结合热点选题与 AI
                                            仿写，可提升账号活跃度与曝光机会。
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
