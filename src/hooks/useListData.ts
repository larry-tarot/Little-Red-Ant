import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';

/**
 * 分页信息
 */
export interface ListPagination {
    page: number;
    pageSize: number;
    total: number;
}

/**
 * 通用列表数据获取函数签名
 *
 * @template T 列表项类型
 * @template F 筛选器类型
 */
export type ListFetcher<T, F extends Record<string, unknown>> = (params: {
    page: number;
    pageSize: number;
    filters: F;
}) => Promise<{ data: T[]; total: number }>;

/**
 * useListData 配置项
 *
 * @template T 列表项类型
 * @template F 筛选器类型
 */
export interface UseListDataOptions<T, F extends Record<string, unknown>> {
    /**
     * 数据获取函数，负责调用 API 并返回当前页数据与总数
     */
    fetcher: ListFetcher<T, F>;
    /**
     * 筛选器初始值
     */
    initialFilters?: F;
    /**
     * 默认每页条数
     * @default 10
     */
    defaultPageSize?: number;
    /**
     * 是否立即开始加载数据
     * @default true
     */
    enabled?: boolean;
    /**
     * 额外依赖数组，变化时会重新加载数据
     */
    deps?: unknown[];
    /**
     * 加载失败时提示的文案
     * @default '加载失败'
     */
    errorMessage?: string;
    /**
     * 工作模式：server 为服务端分页（默认），client 为前端分页/筛选
     * @default 'server'
     */
    mode?: 'server' | 'client';
    /**
     * client 模式下的筛选函数，返回 true 表示保留该项
     */
    filterFn?: (item: T, filters: F) => boolean;
}

/**
 * useListData 返回值
 *
 * @template T 列表项类型
 * @template F 筛选器类型
 */
export interface UseListDataResult<T, F extends Record<string, unknown>> {
    /** 当前页数据 */
    data: T[];
    /** 是否处于首次加载 */
    loading: boolean;
    /** 错误信息，无错误时为 null */
    error: string | null;
    /** 当前筛选器 */
    filters: F;
    /** 设置筛选器（变化后会自动重置到第 1 页并重新加载） */
    setFilters: (updater: F | ((prev: F) => F)) => void;
    /** 当前分页信息 */
    pagination: ListPagination;
    /** 设置当前页 */
    setPage: (page: number) => void;
    /** 设置每页条数，同时回到第 1 页 */
    setPageSize: (pageSize: number) => void;
    /** 重新加载当前页数据 */
    refresh: () => void;
    /** 根据条件移除列表中的项（乐观更新） */
    removeItem: (predicate: (item: T) => boolean) => void;
    /** 根据条件更新列表中的项（乐观更新） */
    updateItem: (predicate: (item: T) => boolean, updater: (item: T) => T) => void;
}

/**
 * 通用列表数据 Hook
 *
 * 功能描述：抽象列表页常见的分页、筛选、加载、错误处理、乐观更新逻辑，
 * 减少各页面中重复的 useState/useEffect 样板代码。
 *
 * 参数说明：
 * - options.fetcher: 数据获取函数
 * - options.initialFilters: 初始筛选器
 * - options.defaultPageSize: 默认每页条数，默认 10
 * - options.enabled: 是否立即加载，默认 true
 * - options.deps: 额外依赖，变化时重新加载
 * - options.errorMessage: 错误提示文案，默认 '加载失败'
 *
 * 返回说明：
 * - data: 当前页数据
 * - loading: 是否首次加载
 * - error: 错误信息
 * - filters / setFilters: 筛选器读写
 * - pagination / setPage / setPageSize: 分页相关
 * - refresh: 刷新当前页
 * - removeItem / updateItem: 乐观更新
 *
 * 使用示例：
 * ```ts
 * const { data, loading, pagination, setPage, filters, setFilters, refresh, removeItem } = useListData({
 *   fetcher: async ({ page, pageSize, filters }) => {
 *     const res = await axios.get('/api/notes', {
 *       params: { page, pageSize, keyword: filters.keyword },
 *     });
 *     return { data: res.data.data, total: res.data.total };
 *   },
 *   initialFilters: { keyword: '' },
 *   defaultPageSize: 10,
 * });
 * ```
 *
 * 异常情况：
 * - fetcher 抛错时，error 被设置为错误信息，并弹出 toast 提示。
 */
export function useListData<T, F extends Record<string, unknown>>(
    options: UseListDataOptions<T, F>,
): UseListDataResult<T, F> {
    const {
        fetcher,
        initialFilters,
        defaultPageSize = 10,
        enabled = true,
        deps = [],
        errorMessage = '加载失败',
        mode = 'server',
        filterFn,
    } = options;

    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFiltersState] = useState<F>(initialFilters ?? ({} as F));
    const [pagination, setPagination] = useState<ListPagination>({
        page: 1,
        pageSize: defaultPageSize,
        total: 0,
    });

    const isMounted = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);
    // fetcher 通常由调用方内联定义，直接作为 useCallback 依赖会导致无限循环。
    // 通过 ref 保存最新 fetcher，由调用方通过 deps 控制何时重新加载。
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const fetchData = useCallback(async () => {
        // 取消上一次未完成的请求
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const result = await fetcherRef.current({
                page: pagination.page,
                pageSize: pagination.pageSize,
                filters,
            });

            if (isMounted.current && !controller.signal.aborted) {
                setData(result.data);
                // client 模式下 fetcher 返回全量数据，total 以实际返回长度为准
                const total = mode === 'client' ? result.data.length : result.total;
                setPagination(prev => ({ ...prev, total }));
                setError(null);
            }
        } catch (err: unknown) {
            if (isMounted.current && !controller.signal.aborted) {
                const message = (err as Error)?.message || errorMessage;
                setError(message);
                toast.error(message);
            }
        } finally {
            if (isMounted.current && !controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [pagination.page, pagination.pageSize, filters, errorMessage, mode]);

    useEffect(() => {
        if (enabled) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, fetchData, ...deps]);

    const setFilters = useCallback((updater: F | ((prev: F) => F)) => {
        setFiltersState(prev => {
            const next = typeof updater === 'function' ? (updater as (prev: F) => F)(prev) : updater;
            return next;
        });
        // 筛选条件变化时回到第一页
        setPagination(prev => ({ ...prev, page: 1 }));
    }, []);

    const setPage = useCallback((page: number) => {
        setPagination(prev => ({ ...prev, page }));
    }, []);

    const setPageSize = useCallback((pageSize: number) => {
        setPagination(prev => ({ ...prev, pageSize, page: 1 }));
    }, []);

    const refresh = useCallback(() => {
        fetchData();
    }, [fetchData]);

    const removeItem = useCallback((predicate: (item: T) => boolean) => {
        setData(prev => prev.filter(item => !predicate(item)));
        setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    }, []);

    const updateItem = useCallback((predicate: (item: T) => boolean, updater: (item: T) => T) => {
        setData(prev => prev.map(item => (predicate(item) ? updater(item) : item)));
    }, []);

    // client 模式下在内存中做筛选与分页
    const filteredData = useMemo(() => {
        if (mode !== 'client' || !filterFn) return data;
        return data.filter(item => filterFn(item, filters));
    }, [mode, data, filterFn, filters]);

    const derivedData = useMemo(() => {
        if (mode !== 'client') return data;
        const start = (pagination.page - 1) * pagination.pageSize;
        return filteredData.slice(start, start + pagination.pageSize);
    }, [mode, data, filteredData, pagination.page, pagination.pageSize]);

    const derivedPagination = useMemo(() => {
        if (mode !== 'client') return pagination;
        return { ...pagination, total: filteredData.length };
    }, [mode, pagination, filteredData.length]);

    return {
        data: derivedData,
        loading,
        error,
        filters,
        setFilters,
        pagination: derivedPagination,
        setPage,
        setPageSize,
        refresh,
        removeItem,
        updateItem,
    };
}
