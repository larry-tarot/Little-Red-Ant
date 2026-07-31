import { useState, useEffect, useCallback, useRef } from 'react';
import axios from '@/lib/axios';
import { toast } from 'react-hot-toast';
import type { SummaryStats, NoteStat, EngagementStats, PaginationState } from '../components/analytics/types';
import { getFriendlyError, extractAxiosErrorMessage } from '../utils/ErrorMessages';


/**
 * 功能描述：数据看板数据获取与状态管理 Hook
 *
 * 设计思路：
 * 将 Analytics 页面的数据请求、分页管理、刷新轮询逻辑集中到 Hook 中，
 * 使页面组件只负责渲染与用户交互，符合关注点分离原则。
 *
 * 返回说明：
 * - state: 数据与加载状态
 * - pagination: 分页状态
 * - actions: 分页、刷新等操作函数
 */
export function useAnalytics() {
    const [summary, setSummary] = useState<SummaryStats | null>(null);
    const [engagement, setEngagement] = useState<EngagementStats | null>(null);
    const [notes, setNotes] = useState<NoteStat[]>([]);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [listLoading, setListLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 10, total: 0 });
    const pollAbortRef = useRef(false);

    /**
     * 功能描述：获取摘要、历史趋势、互动分析
     *
     * 参数说明：
     * - signal: [AbortSignal | undefined] 用于取消请求的 AbortSignal
     */
    const fetchSummaryAndChart = useCallback(async (signal?: AbortSignal) => {
        try {
            const [summaryRes, historyRes, engagementRes] = await Promise.all([
                axios.get('/api/analytics/summary', { signal }),
                axios.get('/api/analytics/history', { signal }),
                axios.get('/api/analytics/engagement', { signal })
            ]);

            setSummary(summaryRes.data);
            setEngagement(engagementRes.data);
            setError(null);

            if (Array.isArray(historyRes.data)) {
                const normalized = historyRes.data.map((item: any) => ({
                    ...item,
                    interaction: item.interaction ?? (item.likes + item.comments + item.collects)
                }));
                setChartData(normalized);
            }
        } catch (error) {
            if (!axios.isCancel(error)) {
                const msg = extractAxiosErrorMessage(error);
                setError(msg);
                toast.error('数据加载失败');
            }
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, []);

    /**
     * 功能描述：获取笔记列表
     *
     * 参数说明：
     * - page: [number] 页码
     * - pageSize: [number] 每页条数
     * - signal: [AbortSignal | undefined] 用于取消请求的 AbortSignal
     */
    const fetchNotes = useCallback(async (page: number, pageSize: number, signal?: AbortSignal) => {
        setListLoading(true);
        try {
            const res = await axios.get(`/api/analytics/notes?page=${page}&pageSize=${pageSize}`, { signal });

            if (res.data.data) {
                setNotes(res.data.data);
                setPagination(prev => ({ ...prev, total: res.data.total }));
            } else if (Array.isArray(res.data)) {
                // Fallback for legacy API
                setNotes(res.data);
                setPagination(prev => ({ ...prev, total: res.data.length }));
            }
        } catch (e) {
            if (!axios.isCancel(e)) {
                toast.error('笔记列表加载失败');
            }
        } finally {
            if (!signal?.aborted) {
                setListLoading(false);
            }
        }
    }, []);

    // 初始加载摘要与图表
    useEffect(() => {
        const controller = new AbortController();
        fetchSummaryAndChart(controller.signal);
        return () => controller.abort();
    }, [fetchSummaryAndChart]);

    // 分页变化时加载笔记列表
    useEffect(() => {
        const controller = new AbortController();
        fetchNotes(pagination.page, pagination.pageSize, controller.signal);
        return () => controller.abort();
    }, [fetchNotes, pagination.page, pagination.pageSize]);

    /**
     * 功能描述：切换页码
     *
     * 参数说明：
     * - newPage: [number] 目标页码
     */
    const handlePageChange = useCallback((newPage: number) => {
        setPagination(prev => {
            const totalPages = Math.ceil(prev.total / prev.pageSize);
            if (newPage > 0 && newPage <= totalPages) {
                return { ...prev, page: newPage };
            }
            return prev;
        });
    }, []);

    /**
     * 功能描述：切换每页条数，重置到第一页
     *
     * 参数说明：
     * - newSize: [number] 每页条数
     */
    const handlePageSizeChange = useCallback((newSize: number) => {
        setPagination(prev => ({ ...prev, pageSize: newSize, page: 1 }));
    }, []);

    /**
     * 功能描述：触发后端同步任务并轮询结果
     */
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        pollAbortRef.current = false;

        try {
            const res = await axios.post('/api/analytics/refresh');
            const { taskId } = res.data;

            let attempts = 0;
            let taskStatus = 'PENDING';

            while ((taskStatus === 'PENDING' || taskStatus === 'PROCESSING') && !pollAbortRef.current) {
                await new Promise(r => setTimeout(r, 2000));
                attempts++;

                try {
                    const taskRes = await axios.get(`/api/tasks/${taskId}`);
                    taskStatus = taskRes.data.status;

                    if (taskStatus === 'COMPLETED') {
                        await fetchSummaryAndChart();
                        await fetchNotes(pagination.page, pagination.pageSize);
                        toast.success('数据同步完成！');
                        return;
                    } else if (taskStatus === 'FAILED') {
                        throw new Error(taskRes.data.error || '同步失败');
                    }

                    if (attempts > 120) throw new Error('同步超时，请稍后重试');
                } catch (pollErr: any) {
                    if (pollErr.message.includes('失败') || pollErr.message.includes('超时')) throw pollErr;
                }
            }
        } catch (error: any) {
            const msg = extractAxiosErrorMessage(error);
            setError(msg);
            const friendly = getFriendlyError(msg);
            toast.error(`数据更新失败：${friendly.title} - ${friendly.message}。${friendly.suggestion}`, {
                duration: 6000
            });
        } finally {
            setRefreshing(false);
        }
    }, [fetchSummaryAndChart, fetchNotes, pagination.page, pagination.pageSize]);

    const cancelRefresh = useCallback(() => {
        pollAbortRef.current = true;
        setRefreshing(false);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    /**
     * 功能描述：使用 RPA 浏览器打开单篇笔记
     *
     * 参数说明：
     * - noteId: [string] 笔记 ID
     */
    const handleOpenInBrowser = useCallback(async (noteId: string) => {
        try {
            await axios.post('/api/accounts/open-note', { noteId });
        } catch (error: any) {
            toast.error(`打开失败: ${error.response?.data?.error || '请确保账号已登录'}`);
        }
    }, []);

    /**
     * 功能描述：导出数据为 Excel
     */
    const handleExport = useCallback(() => {
        window.location.href = '/api/analytics/export';
    }, []);

    return {
        state: { summary, engagement, notes, chartData, loading, listLoading, refreshing, error },
        pagination,
        actions: {
            handlePageChange,
            handlePageSizeChange,
            handleRefresh,
            cancelRefresh,
            clearError,
            handleOpenInBrowser,
            handleExport
        }
    };
}
