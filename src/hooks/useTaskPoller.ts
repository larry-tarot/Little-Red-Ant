import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface TaskResult {
    success: boolean;
    data?: any;
    error?: string;
}

interface UseTaskPollerOptions {
    onSuccess?: (data: any) => void;
    onError?: (error: string) => void;
    pollInterval?: number;
    timeout?: number; // Default 120s
    onProgress?: (progress: number, stage?: string) => void;
}

export function useTaskPoller(options: UseTaskPollerOptions = {}) {
    const [taskId, setTaskId] = useState<string | null>(null);
    const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('IDLE');
    const [progress, setProgress] = useState<number>(0);
    const [stage, setStage] = useState<string | undefined>(undefined);
    const [result, setResult] = useState<any | null>(null);

    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const esRef = useRef<EventSource | null>(null);
    const startTimeRef = useRef<number>(0);

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
        teardown();
        if (succeeded) {
            setStatus('COMPLETED');
            setProgress(100);
            setResult(data);
            if (options.onSuccess) options.onSuccess(data);
        } else {
            setStatus('FAILED');
            setResult(null);
            if (options.onError) options.onError(errorMsg || '任务执行失败');
        }
    }, [options, teardown]);

    const startPollingFallback = useCallback((tid: string) => {
        // Fallback: poll /api/tasks/:id every pollInterval ms.
        // Only used if EventSource fails (e.g. proxy strips SSE, server overload).
        pollRef.current = setInterval(async () => {
            try {
                const res = await axios.get(`/api/tasks/${tid}`);
                const task = res.data;
                const pct = typeof task.progress === 'number' ? task.progress : 0;
                setProgress(pct);
                if (task.status === 'COMPLETED') {
                    finishWithResult(true, task.result);
                } else if (task.status === 'FAILED') {
                    finishWithResult(false, null, task.error || '任务执行失败');
                } else if (Date.now() - startTimeRef.current > (options.timeout || 120000)) {
                    finishWithResult(false, null, 'Timeout');
                }
            } catch (e) {
                console.warn('Poll error:', e);
            }
        }, options.pollInterval || 2000);
    }, [options, finishWithResult]);

    const startTask = useCallback(async (apiCall: () => Promise<string>, loadingMessage = '任务启动中...') => {
        setStatus('PENDING');
        setProgress(0);
        setResult(null);
        setStage(undefined);
        startTimeRef.current = Date.now();

        let tid = '';
        const toastId = toast.loading(loadingMessage);

        try {
            tid = await apiCall();
            setTaskId(tid);
            setStatus('PROCESSING');

            // PRIMARY: Subscribe to SSE for real-time progress.
            // EventSource will reconnect automatically; onerror falls back to polling.
            try {
                const es = new EventSource(`/api/tasks/${tid}/events`, { withCredentials: true });
                esRef.current = es;

                es.onmessage = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (typeof data.progress === 'number') setProgress(data.progress);
                        if (data.stage) {
                            setStage(data.stage);
                            // Refresh the loading toast text so the user sees what's happening.
                            toast.loading(`${loadingMessage} · ${data.stage}`, { id: toastId });
                            if (options.onProgress) options.onProgress(data.progress, data.stage);
                        }
                        if (data.status === 'COMPLETED') {
                            finishWithResult(true, null); // result comes from /:id fetch below
                            toast.success('任务完成！', { id: toastId });
                            // Best-effort: fetch full task to get .result payload.
                            axios.get(`/api/tasks/${tid}`).then((r) => {
                                if (r.data?.result) setResult(r.data.result);
                                if (options.onSuccess) options.onSuccess(r.data?.result);
                            }).catch(() => { /* ignore */ });
                        } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
                            const errMsg = data.status === 'FAILED' ? '任务执行失败' : '任务已取消';
                            finishWithResult(false, null, errMsg);
                            toast.error(errMsg, { id: toastId });
                        }
                    } catch (parseErr) {
                        // Heartbeats and other non-JSON lines arrive on 'message' too; ignore.
                    }
                };

                es.onerror = () => {
                    // Browser auto-reconnects. If we still have no data after 5s, fall back to polling.
                    if (esRef.current === es) {
                        // Don't tear down the SSE — give it a chance. But start polling too as belt-and-suspenders.
                        // Stop fallback if SSE is alive
                        if (!pollRef.current) {
                            startPollingFallback(tid);
                        }
                    }
                };

                return;
            } catch (sseError) {
                console.warn('SSE unavailable, falling back to polling:', sseError);
            }

            // Fallback path: polling only.
            startPollingFallback(tid);

        } catch (e: any) {
            setStatus('FAILED');
            const msg = e.response?.data?.error || e.message || '启动失败';
            toast.error(msg, { id: toastId });
            if (options.onError) options.onError(msg);
        }
    }, [options, finishWithResult, startPollingFallback]);

    // Cleanup on unmount
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
