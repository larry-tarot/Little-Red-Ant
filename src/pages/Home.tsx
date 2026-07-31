import axios from '@/lib/axios';
import {
  PenTool, Sparkles, TrendingUp, Plus, Activity, Eye, Heart,
  MessageCircle, AlertCircle, Clock, CheckCircle, ChevronDown,
  RefreshCw, User, ArrowUp, ArrowDown, Star, LayoutGrid, Hand
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import toast from 'react-hot-toast';
import { format, subDays, startOfDay } from 'date-fns';
import FirstRunGuide from '../components/FirstRunGuide';
import { HomePageSkeleton } from '../components/ui/Skeleton';
import { useState, useEffect, useMemo } from "react";

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
 * 首页仪表盘
 *
 * 展示核心数据指标、趋势图表、账号切换、系统状态和快捷入口。
 * 所有 UI 颜色基于 design tokens，支持亮色/暗色主题。
 */
export default function Home() {
  const user = useAuthStore(state => state.user);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [rawHistory, setRawHistory] = useState<any[]>([]);
  const [tasks, setTasks] = useState<TaskStats>({ pending: 0, failed: 0, completed: 0 });
  const [loading, setLoading] = useState(true);

  // Account Switching State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dashboard State
  const [timeRange, setTimeRange] = useState<'7d' | '30d'>('7d');
  const [chartMetric, setChartMetric] = useState<'views' | 'likes' | 'comments'>('views');

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardData(controller.signal);
    fetchAccounts();
    return () => controller.abort();
  }, []);

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

  const handleSwitchAccount = async (account: Account) => {
      if (account.id === activeAccount?.id) {
          setShowAccountMenu(false);
          return;
      }

      try {
          await axios.post(`/api/accounts/${account.id}/active`);
          setActiveAccount(account);
          setAccounts(accounts.map(a => ({...a, is_active: a.id === account.id})));
          toast.success(`已切换至账号: ${account.nickname}`);
          fetchDashboardData(); // Refresh data for new account
      } catch (_e) {
          toast.error('切换账号失败');
      } finally {
          setShowAccountMenu(false);
      }
  };

  const handleRefreshData = async () => {
      if (isRefreshing) return;
      setIsRefreshing(true);

      // Removed toast.loading since we have a global task monitor now
      try {
          await axios.post('/api/analytics/refresh');
          // Just trigger the task, let the global monitor handle the UI feedback
          toast.success('数据同步任务已提交');
      } catch (e: any) {
          toast.error(e.response?.data?.error || '同步请求失败');
      } finally {
          setIsRefreshing(false);
      }
  };

  // Process Data for Charts and Metrics
  // Note: rawHistory contains cumulative snapshots per day.
  const { chartData, metrics, totals } = useMemo(() => {
    if (!rawHistory || rawHistory.length === 0) {
        return { chartData: [], metrics: null, totals: null };
    }

    const days = timeRange === '7d' ? 7 : 30;
    const today = startOfDay(new Date());
    const currentPeriodStart = subDays(today, days); // e.g. 7 days ago 00:00:00
    const previousPeriodStart = subDays(today, days * 2);

    // Group by date
    const dailyMap = new Map();

    // Initialize map with 0s for all days in range to ensure continuity
    for (let i = 0; i < days * 2; i++) {
        const d = subDays(today, i);
        const dateStr = format(d, 'yyyy-MM-dd');
        dailyMap.set(dateStr, { views: 0, likes: 0, comments: 0, collects: 0, date: dateStr });
    }

    // Deduplicate: Keep only the LATEST snapshot per note per day
    const uniqueDailyNotes = new Map<string, any>(); // Key: "date_noteId", Value: Stats Object

    rawHistory.forEach((item: any) => {
        const dateStr = (item.record_time || '').replace(' ', 'T').split('T')[0];
        if (!dateStr) return; // Skip invalid dates
        const key = `${dateStr}_${item.note_id}`;

        if (!uniqueDailyNotes.has(key)) {
            uniqueDailyNotes.set(key, item);
        } else {
            // If exists, keep the one with later timestamp (or larger value)
            const existing = uniqueDailyNotes.get(key);
            if (new Date(item.record_time) > new Date(existing.record_time)) {
                uniqueDailyNotes.set(key, item);
            }
        }
    });

    // Aggregate Daily Totals
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

    const allDailyData = Array.from(dailyMap.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Filter Logic:
    // Current: > currentPeriodStart (strict after? No, we want inclusive of the start day usually)
    // Let's use string comparison for safety as we keyed by YYYY-MM-DD
    const currentStartStr = format(currentPeriodStart, 'yyyy-MM-dd');
    const _prevStartStr = format(previousPeriodStart, 'yyyy-MM-dd');

    const _currentPeriodData = allDailyData.filter(d => d.date > currentStartStr);
    // Wait, if today is 25th, subDays(7) is 18th.
    // 18, 19, 20, 21, 22, 23, 24, 25 (8 days).
    // Usually "Last 7 days" means [Today-6, Today].
    // Let's just take the last N items since we filled the map.

    const filledCurrentData = allDailyData.slice(-days);
    const filledPrevData = allDailyData.slice(-days * 2, -days);

    // Calculate Totals:
    // Logic:
    // "Reading (Views)" etc. on Home page should reflect the "New Growth" in the selected period to show trend.
    // If we want "Total Account Views", we should use the latest day's total (if data is cumulative).
    // However, the user is confused why it doesn't match Analytics page (Total).
    // Analytics page shows "Total Account Views" (SUM of current note stats).
    // Home page "Trend" usually implies "Performance in this period".
    // Let's change Home page to show "Total Growth in Period" clearly, OR "Current Total" and "Growth Rate".

    // DECISION: To avoid confusion, let's make the BIG NUMBER match the "Analytics" page (Total Current),
    // and the green badge show the "Growth" in the selected period.

    // BUT: The chart shows "Trend".
    // AND: note_stats_history contains CUMULATIVE snapshots per note per day.

    // 1. Calculate Daily Totals (Sum of all notes for that day)
    // We need to handle multiple notes.
    // The rawHistory is flat: { note_id, views, record_time }
    // dailyMap keys are dates. The values currently are SUM of all records.
    // If note_stats_history has ONE record per note per day (ideal), then SUM(views) for Day X = Total Account Views on Day X.

    // Let's verify if dailyMap aggregation is correct for Cumulative:
    // Yes, if we sum up Note A (100) + Note B (200) = Account Total (300). This is correct.

    // 2. Calculate Growth
    // Growth = Total(End) - Total(Start)
    // Current Stats (for Cards) -> Should be Latest Available Total.

    const latestDateData = filledCurrentData[filledCurrentData.length - 1] || { views: 0, likes: 0, comments: 0, collects: 0 };
    const startDateData = filledCurrentData[0] || { views: 0, likes: 0, comments: 0, collects: 0 };

    // Previous Period (for trend comparison)
    const prevLatestData = filledPrevData[filledPrevData.length - 1] || { views: 0, likes: 0, comments: 0, collects: 0 };
    const prevStartData = filledPrevData[0] || { views: 0, likes: 0, comments: 0, collects: 0 };

    // Calculate Growth in Period (Delta)
    const getGrowth = (latest: any, start: any, key: string) => Math.max(0, (latest[key] || 0) - (start[key] || 0));

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

    // Card Value: Show "Total (Latest)" to match Analytics Page?
    // Or "Growth"? The label says "Reading (Views)".
    // If I show Total, it will be 21k.
    // If I show Growth, it will be e.g. 1k.
    // The previous bug showed 300k (Sum of daily totals).

    // Let's show "Latest Total" (Account Status) and the Badge shows "Growth Rate" compared to previous period's growth?
    // Or Badge shows "Growth Count"?
    // Standard Dashboard: Big Number = Total Current. Badge = Growth over period.

    const currentStats = {
        views: latestDateData.views || 0,
        likes: latestDateData.likes || 0,
        comments: latestDateData.comments || 0,
        collects: latestDateData.collects || 0,
    };

    const calcTrend = (currGrowth: number, prevGr: number): TrendData => {
        if (prevGr === 0) return { value: currGrowth, trend: currGrowth > 0 ? 100 : 0, isPositive: true };
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
        // Pass current totals for display
        totals: currentStats
    };
  }, [rawHistory, timeRange]);

  const MetricCard = ({ title, icon: Icon, color, data, total, active, onClick }: any) => (
    <div
        onClick={onClick}
        className={`bg-surface p-5 rounded-xl border cursor-pointer transition-all duration-200 ${
            active ? 'border-primary shadow-md ring-1 ring-primary/20' : 'border-border shadow-sm hover:border-border-strong hover:shadow'
        }`}
    >
        <div className="flex justify-between items-start mb-3">
            <div className={`p-2 rounded-lg ${color}`}>
                <Icon size={20} />
            </div>
            {data && (
                <div className={`flex items-center text-xs font-medium ${data.isPositive ? 'text-success bg-success-subtle' : 'text-danger bg-danger-subtle'} px-2 py-1 rounded-full`} title="Period Growth Trend">
                    {data.isPositive ? <ArrowUp size={12} className="mr-1"/> : <ArrowDown size={12} className="mr-1"/>}
                    {data.trend.toFixed(1)}%
                </div>
            )}
        </div>
        <div>
            <p className="text-sm text-text-secondary mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-text">{total ? total.toLocaleString() : '-'}</h3>
            {data && <p className="text-xs text-text-tertiary mt-1">本期新增: +{data.value.toLocaleString()}</p>}
        </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {loading ? <HomePageSkeleton /> : (
      <>
      <FirstRunGuide />
      {/* Header Section */}
      <div className="bg-surface rounded-2xl p-6 shadow-sm border border-border">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-text flex items-center">
                    早安, {user?.username || '运营官'}
                    <Hand className="ml-2 text-warning" size={28} />
                </h1>
                <p className="text-text-secondary text-sm mt-1">
                    当前展示 <span className="font-medium text-text">{activeAccount?.nickname}</span> 的数据概览。
                </p>
            </div>

            <div className="flex items-center space-x-3">
                {/* Account Switcher */}
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
                                <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">切换账号</span>
                            </div>
                            {accounts.length > 0 ? (
                                accounts.map(acc => (
                                    <button
                                        key={acc.id}
                                        onClick={() => handleSwitchAccount(acc)}
                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-surface-muted transition-colors ${acc.is_active ? 'bg-primary-subtle text-primary' : 'text-text-secondary'}`}
                                    >
                                        <div className="flex items-center overflow-hidden">
                                            <div className={`w-2 h-2 rounded-full mr-2 ${acc.is_active ? 'bg-primary' : 'bg-text-tertiary'}`}></div>
                                            <span className="truncate">{acc.nickname}</span>
                                        </div>
                                        {acc.status === 'EXPIRED' && <span className="text-[10px] text-danger bg-danger-subtle px-1.5 py-0.5 rounded border border-danger/20">失效</span>}
                                    </button>
                                ))
                            ) : (
                                <div className="px-4 py-8 text-center">
                                    <p className="text-sm text-text-secondary mb-2">暂无账号</p>
                                    <Link to="/accounts" className="text-sm text-primary hover:text-primary-hover font-medium">去添加</Link>
                                </div>
                            )}
                            <div className="border-t border-border mt-1 pt-1">
                                <Link to="/accounts" className="block w-full text-left px-4 py-2 text-xs text-text-tertiary hover:text-primary hover:bg-surface-muted transition-colors">
                                    管理所有账号 &rarr;
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleRefreshData}
                    disabled={isRefreshing}
                    className={`flex items-center justify-center p-2.5 border border-border rounded-lg hover:bg-surface-muted transition-colors ${isRefreshing ? 'text-primary bg-primary-subtle' : 'text-text-secondary'}`}
                    title="同步最新数据"
                >
                    <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>
         </div>
      </div>

      {/* Analytics Section */}
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
                    className={`flex items-center px-4 py-2 bg-surface border border-border rounded-md text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors ${isRefreshing ? 'opacity-70 cursor-wait' : ''}`}
                >
                    <RefreshCw size={16} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? '同步中...' : '同步数据'}
                </button>
                <div className="flex bg-surface rounded-md shadow-sm border border-border">
                    <button
                        onClick={() => setTimeRange('7d')}
                        className={`px-3 py-2 text-sm font-medium rounded-l-md ${timeRange === '7d' ? 'bg-primary-subtle text-primary' : 'text-text-secondary hover:bg-surface-muted'}`}
                    >
                        近7天
                    </button>
                    <div className="w-px bg-border"></div>
                    <button
                        onClick={() => setTimeRange('30d')}
                        className={`px-3 py-2 text-sm font-medium rounded-r-md ${timeRange === '30d' ? 'bg-primary-subtle text-primary' : 'text-text-secondary hover:bg-surface-muted'}`}
                    >
                        近30天
                    </button>
                </div>
            </div>
        </div>

        {/* Metrics Cards */}
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
                active={false} // No chart for collects yet or reuse views
                onClick={() => {}}
            />
        </div>

        {/* Main Chart */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm mb-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-base font-semibold text-text">
                        {chartMetric === 'views' && '阅读趋势'}
                        {chartMetric === 'likes' && '点赞趋势'}
                        {chartMetric === 'comments' && '评论趋势'}
                    </h3>
                    <p className="text-xs text-text-tertiary mt-1">数据来源：{timeRange === '7d' ? '过去7天' : '过去30天'}每日统计</p>
                </div>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
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
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area
                            type="monotone"
                            dataKey={chartMetric}
                            stroke="var(--primary)"
                            strokeWidth={3}
                            fill="url(#colorValue)"
                            activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--primary)' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* Bottom Grid: Tasks & Quick Access */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Health / Tasks */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-text flex items-center">
                    <Activity className="mr-2 text-primary" size={18} />
                    系统状态
                </h3>
                <span className={`text-xs px-2 py-1 rounded-full ${tasks.failed > 0 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}`}>
                    {tasks.failed > 0 ? '需关注' : '运行正常'}
                </span>
            </div>

            <div className="space-y-4">
                <Link to="/tasks" className="flex items-center justify-between p-3 bg-surface-muted rounded-lg hover:bg-surface-hover transition-colors">
                    <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-primary-subtle flex items-center justify-center text-primary mr-3">
                            <Clock size={16} />
                        </div>
                        <span className="text-sm text-text-secondary">待处理任务</span>
                    </div>
                    <span className="font-bold text-text">{tasks.pending}</span>
                </Link>
                <Link to="/tasks" className="flex items-center justify-between p-3 bg-surface-muted rounded-lg hover:bg-surface-hover transition-colors">
                    <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-success-subtle flex items-center justify-center text-success mr-3">
                            <CheckCircle size={16} />
                        </div>
                        <span className="text-sm text-text-secondary">已完成任务</span>
                    </div>
                    <span className="font-bold text-text">{tasks.completed}</span>
                </Link>
                <Link to="/tasks" className="flex items-center justify-between p-3 bg-surface-muted rounded-lg hover:bg-surface-hover transition-colors">
                    <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-danger-subtle flex items-center justify-center text-danger mr-3">
                            <AlertCircle size={16} />
                        </div>
                        <span className="text-sm text-text-secondary">失败任务</span>
                    </div>
                    <span className="font-bold text-text">{tasks.failed}</span>
                </Link>
            </div>
        </div>

        {/* Quick Access */}
        <div className="lg:col-span-2">
             <h3 className="font-bold text-text mb-4 flex items-center">
                <Sparkles className="mr-2 text-warning" size={18} />
                快速开始
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Link to="/generate" className="group p-4 bg-surface border border-danger/20 rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-danger-subtle text-danger rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                        <Plus size={24} />
                    </div>
                    <span className="text-sm font-bold text-text">写篇笔记</span>
                    <span className="text-xs text-text-tertiary mt-1">AI 辅助创作</span>
                </Link>

                <Link to="/trends" className="group p-4 bg-surface border border-border rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 bg-warning-subtle text-warning rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <TrendingUp size={20} />
                    </div>
                    <span className="text-sm font-medium text-text-secondary">查看热搜</span>
                </Link>

                <Link to="/persona" className="group p-4 bg-surface border border-border rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 bg-primary-subtle text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <PenTool size={20} />
                    </div>
                    <span className="text-sm font-medium text-text-secondary">人设管理</span>
                </Link>

                <Link to="/analytics" className="group p-4 bg-surface border border-border rounded-xl hover:shadow-md transition-all flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 bg-primary-subtle text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Activity size={20} />
                    </div>
                    <span className="text-sm font-medium text-text-secondary">完整看板</span>
                </Link>
            </div>

            <div className="mt-6 bg-primary-subtle rounded-xl p-4 flex items-start">
                <div className="bg-primary-subtle p-2 rounded-lg text-primary mr-3">
                    <Sparkles size={16} />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-text">运营小贴士</h4>
                    <p className="text-xs text-text-secondary mt-1">
                        保持每周 3-5 篇的更新频率，结合热点选题与 AI 仿写，可提升账号活跃度与曝光机会。
                    </p>
                </div>
            </div>
        </div>
      </div>
      </>
    )}
    </div>
  );
}
