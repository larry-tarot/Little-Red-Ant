
import { useState, useRef, useCallback, useEffect } from 'react';
import axios from '@/lib/axios';
import toast from 'react-hot-toast';
import { fetchSseToken } from '@/lib/sseToken';

interface UseTaskPollerOptions {
    onSuccess?: (data: any) => void;
    onError?: (error: string) => void;
    pollInterval?: number;
    timeout?: number; // Default 180s
    onProgress?: (progress: number, stage?: string) => void;
}

/**
 * 功能描述：统一任务轮询 Hook
 *
 * 设计思路：
 * - 优先使用 SSE 接收实时进度
 * - SSE 不可用时降级为轮询
 * - 任务完成后统一从 /api/tasks/:id 获取完整结果再触发 onSuccess
 * - 组件卸载时清理所有连接，防止内存泄漏和重复回调
 */
export function useTaskPoller(options: UseTaskPollerOptions = {}) {
    const [taskId, setTaskId] = useState<string | null>(null);
    const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('IDLE');
    const [progress, setProgress] = useState<number>(0);
    const [stage, setStage] = useState<string | undefined>(undefined);
    const [result, setResult] = useState<any | null>(null);

    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const esRef = useRef<EventSource | null>(null);
    const startTimeRef = useRef<number>(0);
    const finishedRef = useRef<boolean>(false);
    const toastIdRef = useRef<string | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const stopSSE = useCallback(() => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
    }, []);

    const teardown = useCallback(() => {
        stopPolling();
        stopSSE();
    }, [stopPolling, stopSSE]);

    const finishWithResult = useCallback((succeeded: boolean, data: any, errorMsg?: string) => {
        // 防止 SSE 和 polling 同时触发导致重复回调
        if (finishedRef.current) return;
        finishedRef.current = true;

        teardown();
        if (succeeded) {
            setStatus('COMPLETED');
            setProgress(100);
            setResult(data);
            if (toastIdRef.current) {
                toast.success('任务完成！', { id: toastIdRef.current });
            }
            if (options.onSuccess) options.onSuccess(data);
        } else {
            setStatus('FAILED');
            setResult(null);
            if (toastIdRef.current) {
                toast.error(errorMsg || '任务执行失败', { id: toastIdRef.current });
            }
            if (options.onError) options.onError(errorMsg || '任务执行失败');
        }
    }, [options, teardown]);

    /**
     * 功能描述：获取任务最终结果并结束轮询
     */
    const finalizeTask = useCallback(async (tid: string, succeeded: boolean, errorMsg?: string) => {
        if (finishedRef.current) return;

        if (!succeeded) {
            finishWithResult(false, null, errorMsg);
            return;
        }

        try {
            const res = await axios.get(`/api/tasks/${tid}`);
            const taskResult = res.data?.result ?? null;
            finishWithResult(true, taskResult);
        } catch (_e) {
            // 任务本身成功，但获取结果失败，仍然标记成功
            finishWithResult(true, null);
        }
    }, [finishWithResult]);

    const startPollingFallback = useCallback((tid: string) => {
        if (pollRef.current) return;

        pollRef.current = setInterval(async () => {
            if (finishedRef.current) return;

            try {
                const res = await axios.get(`/api/tasks/${tid}`);
                const task = res.data;
                const pct = typeof task.progress === 'number' ? task.progress : 0;
                setProgress(pct);

                if (task.status === 'COMPLETED') {
                    await finalizeTask(tid, true);
                } else if (task.status === 'FAILED' || task.status === 'CANCELLED') {
                    await finalizeTask(tid, false, task.error || '任务执行失败');
                } else if (Date.now() - startTimeRef.current > (options.timeout || 180000)) {
                    await finalizeTask(tid, false, '任务执行超时');
                }
            } catch (_e) {
                // 轮询异常时静默忽略，避免频繁弹窗
            }
        }, options.pollInterval || 2000);
    }, [options.pollInterval, options.timeout, finalizeTask]);

    const startTask = useCallback(async (apiCall: () => Promise<string>, loadingMessage = '任务启动中...') => {
        // 重置所有状态
        setStatus('PENDING');
        setProgress(0);
        setResult(null);
        setStage(undefined);
        setTaskId(null);
        startTimeRef.current = Date.now();
        finishedRef.current = false;

        const toastId = toast.loading(loadingMessage);
        toastIdRef.current = toastId;

        let tid = '';

        try {
            tid = await apiCall();
            setTaskId(tid);
            setStatus('PROCESSING');

            // 1. 尝试 SSE
            // EventSource 无法设置 Authorization header，使用短期 SSE token 替代长期 JWT，
            // 避免 token 被浏览器历史、代理日志、服务器 access log 记录。
            try {
                const sseToken = await fetchSseToken();
                const sseUrl = `/api/tasks/${tid}/events?sse_token=${encodeURIComponent(sseToken)}`;
                const es = new EventSource(sseUrl, { withCredentials: true });
                esRef.current = es;

                es.onmessage = async (e) => {
                    if (finishedRef.current) return;

                    try {
                        const data = JSON.parse(e.data);
                        if (typeof data.progress === 'number') setProgress(data.progress);
                        if (data.stage) {
                            setStage(data.stage);
                            toast.loading(`${loadingMessage} · ${data.stage}`, { id: toastId });
                            if (options.onProgress) options.onProgress(data.progress, data.stage);
                        }

                        if (data.status === 'COMPLETED') {
                            await finalizeTask(tid, true);
                        } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
                            await finalizeTask(tid, false, data.status === 'CANCELLED' ? '任务已取消' : '任务执行失败');
                        }
                    } catch (_parseErr) {
                        // 忽略心跳等非 JSON 消息
                    }
                };

                es.onerror = () => {
                    // 浏览器会自动重连；如果 5 秒后仍未关闭且没有结果，启动 polling 兜底
                    setTimeout(() => {
                        if (esRef.current === es && !finishedRef.current && !pollRef.current) {
                            startPollingFallback(tid);
                        }
                    }, 5000);
                };

                return;
            } catch (sseError) {
                console.warn('SSE unavailable, falling back to polling:', sseError);
            }

            // 2. SSE 不可用，使用 polling
            startPollingFallback(tid);
        } catch (e: any) {
            finishedRef.current = true;
            setStatus('FAILED');
            const msg = e.response?.data?.error || e.message || '启动失败';
            toast.error(msg, { id: toastId });
            if (options.onError) options.onError(msg);
        }
    }, [options, finalizeTask, startPollingFallback]);

    // 组件卸载时清理
    useEffect(() => {
        return () => teardown();
    }, [teardown]);

    return {
        taskId,
        status,
        progress,
        stage,
        result,
        startTask,
        stopPolling: teardown,
    };
}
