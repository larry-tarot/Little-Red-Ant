
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from '@/lib/axios';
import toast from 'react-hot-toast';

export interface Competitor {
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
    friendlyError?: {
        friendly?: {
            code?: string;
            title: string;
            message: string;
            suggestion: string;
            severity: 'error' | 'warning' | 'info';
        };
        original?: string;
        timestamp?: string;
    };
}

interface UseCompetitorsResult {
    competitors: Competitor[];
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    fetchCompetitors: () => Promise<void>;
    refreshCompetitor: (id: number) => Promise<void>;
    deleteCompetitor: (id: number) => Promise<void>;
    addCompetitor: (url: string) => Promise<void>;
}

/**
 * 功能描述：统一竞品数据管理 Hook
 *
 * 设计思路：
 * - 封装列表获取、刷新、删除、添加等操作
 * - 自动轮询正在处理中的任务状态
 * - 提供统一的 loading/refreshing/error 状态
 */
export function useCompetitors(): UseCompetitorsResult {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const stopPolling = useCallback(() => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    }, []);

    const fetchCompetitors = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);

        try {
            const res = await axios.get('/api/competitors');
            if (res.data.success && Array.isArray(res.data.data)) {
                setCompetitors(res.data.data);
            } else {
                setCompetitors([]);
            }
        } catch (err: any) {
            const msg = err.response?.data?.error || err.message || '获取竞品列表失败';
            setError(msg);
            if (!silent) toast.error(msg);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    // 自动轮询：有任务在 processing/pending/refreshing 时，每 3 秒刷新一次
    useEffect(() => {
        const hasRunningTasks = competitors.some((c) =>
            ['pending', 'processing', 'refreshing'].includes(c.status)
        );

        if (hasRunningTasks && !pollIntervalRef.current) {
            pollIntervalRef.current = setInterval(() => fetchCompetitors(true), 3000);
        } else if (!hasRunningTasks) {
            stopPolling();
        }

        return () => stopPolling();
    }, [competitors, fetchCompetitors, stopPolling]);

    const refreshCompetitor = useCallback(async (id: number) => {
        const competitor = competitors.find((c) => c.id === id);
        if (!competitor) return;

        setRefreshing(true);

        // 乐观更新
        setCompetitors((prev) =>
            prev.map((c) => (c.id === id ? { ...c, status: 'refreshing' as const } : c))
        );

        try {
            await axios.post('/api/competitors/analyze', {
                url: `https://www.xiaohongshu.com/user/profile/${competitor.user_id}`,
            });
            toast.success('已添加到更新队列');
        } catch (err: any) {
            toast.error(err.response?.data?.error || '启动更新失败');
            await fetchCompetitors(true);
        } finally {
            setRefreshing(false);
        }
    }, [competitors, fetchCompetitors]);

    const deleteCompetitor = useCallback(async (id: number) => {
        try {
            await axios.delete(`/api/competitors/${id}`);
            toast.success('删除成功');
            await fetchCompetitors(true);
        } catch (err: any) {
            toast.error(err.response?.data?.error || '删除失败');
        }
    }, [fetchCompetitors]);

    const addCompetitor = useCallback(async (url: string) => {
        try {
            await axios.post('/api/competitors/analyze', { url });
            toast.success('已添加分析任务');
            await fetchCompetitors(true);
        } catch (err: any) {
            toast.error(err.response?.data?.error || '添加失败');
        }
    }, [fetchCompetitors]);

    useEffect(() => {
        fetchCompetitors();
    }, [fetchCompetitors]);

    return {
        competitors,
        loading,
        refreshing,
        error,
        fetchCompetitors,
        refreshCompetitor,
        deleteCompetitor,
        addCompetitor,
    };
}
