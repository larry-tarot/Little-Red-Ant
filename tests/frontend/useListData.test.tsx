/**
 * useListData Hook 单元测试
 *
 * 覆盖范围：
 * - 初始化状态
 * - 分页数据获取与分页信息更新
 * - 筛选器变化触发重新加载
 * - 页码变化触发重新加载
 * - 加载状态变化
 * - 错误处理与 toast 提示
 * - 连续请求时的取消机制
 * - 乐观更新列表项
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { useListData } from '@/hooks/useListData';

// 模拟 react-hot-toast，避免测试环境访问真实 DOM
vi.mock('react-hot-toast', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

/** 测试用列表项类型 */
interface TestItem {
    id: number;
    name: string;
}

/** 测试用筛选器类型 */
interface TestFilters {
    [key: string]: string;
    keyword: string;
}

/**
 * 创建一个受控的延迟 Promise，便于精确控制请求完成时机。
 *
 * 使用场景：测试 loading 状态、请求取消等需要手动触发 resolve/reject 的场景。
 */
function createDeferredPromise<T>() {
    let resolve: (value: T) => void = () => {};
    let reject: (reason?: unknown) => void = () => {};

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

describe('useListData Hook', () => {
    // 用于追踪测试过程中创建的所有 AbortController 的 abort 方法
    const abortSpies: Array<ReturnType<typeof vi.fn>> = [];
    let originalAbortController: typeof AbortController;

    beforeEach(() => {
        abortSpies.length = 0;
        originalAbortController = globalThis.AbortController;

        // 替换全局 AbortController，记录每次创建的实例及其 abort 调用
        // 注意：AbortController 需要用 new 调用，因此使用普通函数而非 vi.fn()
        globalThis.AbortController = function MockAbortController() {
            const signal = { aborted: false };
            const abort = vi.fn(() => {
                signal.aborted = true;
            });
            abortSpies.push(abort);
            return { signal, abort } as unknown as AbortController;
        } as unknown as typeof AbortController;

        vi.clearAllMocks();
    });

    afterEach(() => {
        globalThis.AbortController = originalAbortController;
    });

    it('初始化状态：loading 为 false，data 为空，error 为 null，分页为默认值', () => {
        const fetcher = vi.fn().mockResolvedValue({ data: [], total: 0 });

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                enabled: false,
                defaultPageSize: 10,
            })
        );

        // 由于 enabled 为 false，不会触发自动加载，状态保持初始值
        expect(result.current.loading).toBe(false);
        expect(result.current.data).toEqual([]);
        expect(result.current.error).toBeNull();
        expect(result.current.pagination).toEqual({
            page: 1,
            pageSize: 10,
            total: 0,
        });
        expect(result.current.filters).toEqual({});
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('fetchList 会用正确参数调用 fetcher，并更新 data 与 pagination', async () => {
        const fetcher = vi.fn().mockResolvedValue({
            data: [{ id: 1, name: '测试项' }],
            total: 1,
        });

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                initialFilters: { keyword: '测试' },
                defaultPageSize: 20,
            })
        );

        // 等待首次加载完成
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith({
            page: 1,
            pageSize: 20,
            filters: { keyword: '测试' },
        });
        expect(result.current.data).toEqual([{ id: 1, name: '测试项' }]);
        expect(result.current.pagination.total).toBe(1);
    });

    it('setFilters 会更新筛选器状态并触发重新加载', async () => {
        const fetcher = vi.fn().mockResolvedValue({ data: [], total: 0 });

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                initialFilters: { keyword: '' },
            })
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(fetcher).toHaveBeenCalledTimes(1);

        act(() => {
            result.current.setFilters({ keyword: '新关键字' });
        });

        // 筛选器状态应立即更新，并回到第 1 页
        expect(result.current.filters).toEqual({ keyword: '新关键字' });
        expect(result.current.pagination.page).toBe(1);

        // 等待新的请求触发并结束
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(fetcher).toHaveBeenLastCalledWith({
            page: 1,
            pageSize: 10,
            filters: { keyword: '新关键字' },
        });
    });

    it('setPage 会更新当前页并触发重新加载', async () => {
        const fetcher = vi.fn().mockResolvedValue({ data: [], total: 100 });

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                initialFilters: { keyword: '' },
            })
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(fetcher).toHaveBeenCalledTimes(1);

        act(() => {
            result.current.setPage(3);
        });

        expect(result.current.pagination.page).toBe(3);

        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(fetcher).toHaveBeenLastCalledWith({
            page: 3,
            pageSize: 10,
            filters: { keyword: '' },
        });
    });

    it('请求过程中 loading 为 true，结束后恢复为 false', async () => {
        const { promise, resolve } = createDeferredPromise<{
            data: TestItem[];
            total: number;
        }>();
        const fetcher = vi.fn().mockReturnValue(promise);

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                initialFilters: { keyword: '' },
            })
        );

        // 请求开始后 loading 应为 true
        await waitFor(() => expect(result.current.loading).toBe(true));
        expect(fetcher).toHaveBeenCalledTimes(1);

        act(() => {
            resolve({ data: [{ id: 1, name: '项' }], total: 1 });
        });

        // 请求结束后 loading 应恢复为 false
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).toEqual([{ id: 1, name: '项' }]);
    });

    it('fetcher 抛出错误时设置 error 并清空 loading，同时弹出 toast', async () => {
        const fetcher = vi
            .fn()
            .mockRejectedValue(new Error('网络请求失败'));
        const mockedToastError = vi.mocked(toast.error);

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                initialFilters: { keyword: '' },
                errorMessage: '加载失败',
            })
        );

        await waitFor(() => expect(result.current.error).not.toBeNull());

        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBe('网络请求失败');
        expect(mockedToastError).toHaveBeenCalledWith('网络请求失败');
    });

    it('连续触发请求时会取消上一次未完成的请求', async () => {
        const first = createDeferredPromise<{ data: TestItem[]; total: number }>();
        const second = createDeferredPromise<{ data: TestItem[]; total: number }>();
        const fetcher = vi.fn().mockImplementation(() => {
            if (fetcher.mock.calls.length === 1) {
                return first.promise;
            }
            return second.promise;
        });

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                initialFilters: { keyword: '' },
            })
        );

        // 确保第一次请求已经发出
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

        act(() => {
            result.current.refresh();
        });

        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

        // 第一次请求的 AbortController 应被调用 abort
        expect(abortSpies).toHaveLength(2);
        expect(abortSpies[0]).toHaveBeenCalled();

        // 完成第二次请求，验证最终以第二次结果为准
        act(() => {
            second.resolve({ data: [{ id: 2, name: '第二次' }], total: 1 });
        });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).toEqual([{ id: 2, name: '第二次' }]);
    });

    it('updateItem 会立即乐观更新列表中的项', async () => {
        const fetcher = vi.fn().mockResolvedValue({
            data: [
                { id: 1, name: '旧名称' },
                { id: 2, name: '保持不变' },
            ],
            total: 2,
        });

        const { result } = renderHook(() =>
            useListData<TestItem, TestFilters>({
                fetcher,
                initialFilters: { keyword: '' },
            })
        );

        await waitFor(() => expect(result.current.data).toHaveLength(2));

        act(() => {
            result.current.updateItem(
                (item) => item.id === 1,
                (item) => ({ ...item, name: '新名称' })
            );
        });

        // 乐观更新应直接修改本地 data，无需再次请求
        expect(result.current.data).toEqual([
            { id: 1, name: '新名称' },
            { id: 2, name: '保持不变' },
        ]);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
