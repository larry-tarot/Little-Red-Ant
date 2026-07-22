import { Router } from 'express';
import { getTask, enqueueTask, cancelTask, taskProgressEvents } from '../services/queue.js';
import { TaskService } from '../services/core/TaskService.js';
import { wrapError } from '../utils/ErrorMessages.js';
import type { TaskProgressEvent } from '../services/tasks/TaskHandler.js';

const router = Router();

// SSE keep-alive: heartbeat every 25s to keep proxies from idling out the connection.
const SSE_HEARTBEAT_MS = 25_000;
// Hard cap on a single SSE stream — protects against zombie subscribers.
const SSE_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
// SSE connection limit — prevents resource exhaustion.
let activeSSEConnections = 0;
const MAX_SSE_CONNECTIONS = 200;

// Get Active Tasks (For Real-time Monitoring)
// When the client sends Accept: text/event-stream, this behaves as a single SSE
// stream for ALL task progress updates. This replaces the old per-task EventSource
// approach, preventing resource exhaustion with many active tasks.
router.get('/active', (req, res) => {
    // SSE mode: stream active task progress in real-time
    if (req.headers.accept === 'text/event-stream') {
        if (activeSSEConnections >= MAX_SSE_CONNECTIONS) {
            return res.status(503).json({ error: 'Too many SSE connections. Please retry later.' });
        }
        activeSSEConnections++;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 30_000);
        const hardStop = setTimeout(() => cleanup(), 30 * 60 * 1000);

        const onProgress = (event: any) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        };
        taskProgressEvents.on('progress', onProgress);

        const cleanup = () => {
            activeSSEConnections--;
            clearInterval(heartbeat);
            clearTimeout(hardStop);
            taskProgressEvents.off('progress', onProgress);
            try { res.end(); } catch { /* socket already closed */ }
        };

        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }

    // Default mode: JSON response
    try {
        const tasks = TaskService.getActiveTasks();
        res.json(tasks);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Task Stats
router.get('/stats', (req, res) => {
    try {
        const stats = TaskService.getTaskStats();
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// List Tasks (Recent or Range)
router.get('/', async (req, res) => {
    try {
        const { DemoService } = await import('../services/DemoService.js');
        if (await DemoService.isDemoMode()) {
            return res.json(DemoService.getMockTasks());
        }
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const startDate = req.query.start_date as string;
        const endDate = req.query.end_date as string;

        const result = TaskService.listTasks(page, pageSize, startDate, endDate);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Single Task
router.get('/:id', (req, res) => {
    try {
        const task = getTask(req.params.id);
        if (!task) {
            return res.status(404).json({
                error: 'Task not found',
                friendlyError: wrapError('TASK_NOT_FOUND')
            });
        }

        // 失败任务添加友好错误信息
        if (task.status === 'FAILED' && task.error) {
            const wrapped = wrapError(task.error);
            res.json({ ...task, friendlyError: wrapped });
        } else {
            res.json(task);
        }
    } catch (error: any) {
        const wrapped = wrapError(error);
        res.status(500).json({
            error: error.message,
            friendlyError: wrapped
        });
    }
});

// SSE: Server-Sent Events stream of progress updates for a single task.
// Frontend useTaskPoller subscribes here; falls back to /:id polling if EventSource fails.
// Uses the global activeSSEConnections/MAX_SSE_CONNECTIONS defined above.
router.get('/:id/events', (req, res) => {
    const taskId = req.params.id;

    if (activeSSEConnections >= MAX_SSE_CONNECTIONS) {
        return res.status(503).json({ error: 'Too many SSE connections. Please retry later.' });
    }
    activeSSEConnections++;

    // Verify the task exists before opening a long-lived stream.
    const initial = getTask(taskId);
    if (!initial) {
        return res.status(404).json({ error: 'Task not found' });
    }

    // SSE headers — disable proxy buffering (Nginx), no cache.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Replay the current progress so a late subscriber immediately sees state
    // (covers the gap between enqueue and first real progress event).
    res.write(`data: ${JSON.stringify({
        taskId,
        progress: initial.progress ?? 0,
        stage: initial.status === 'COMPLETED' ? '已完成' : initial.status === 'FAILED' ? '失败' : '已入队',
        status: initial.status,
    })}\n\n`);

    const onProgress = (event: TaskProgressEvent) => {
        if (event.taskId !== taskId) return;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    taskProgressEvents.on('progress', onProgress);

    // 1Hz poll for terminal status (cheap because the table is indexed on id).
    const statusInterval = setInterval(() => {
        const t = getTask(taskId);
        if (!t) {
            cleanup();
            return;
        }
        if (t.status === 'COMPLETED' || t.status === 'FAILED') {
            res.write(`data: ${JSON.stringify({
                taskId,
                progress: t.status === 'COMPLETED' ? 100 : (t.progress ?? 0),
                stage: t.status === 'COMPLETED' ? '已完成' : '失败',
                status: t.status,
            })}\n\n`);
            cleanup();
        }
    }, 1000);

    const heartbeat = setInterval(() => {
        // SSE comment line — ignored by EventSource on the client, but keeps TCP warm.
        res.write(`: heartbeat ${Date.now()}\n\n`);
    }, SSE_HEARTBEAT_MS);

    const hardStop = setTimeout(() => {
        // Defensive: a stuck subscriber shouldn't pin a handler forever.
        cleanup();
    }, SSE_MAX_DURATION_MS);

    const cleanup = () => {
        activeSSEConnections--;
        clearInterval(statusInterval);
        clearInterval(heartbeat);
        clearTimeout(hardStop);
        taskProgressEvents.off('progress', onProgress);
        try { res.end(); } catch { /* socket already closed */ }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
});

// Cancel Task
router.post('/:id/cancel', (req, res) => {
    try {
        const success = cancelTask(req.params.id);
        if (success) {
            res.json({ success: true, message: 'Task cancelled successfully' });
        } else {
            res.status(400).json({ error: 'Task could not be cancelled (not pending/processing or not found)' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update Task Status
router.put('/:id/status', (req, res) => {
    try {
        const { status, result, error } = req.body;
        TaskService.updateTaskStatus(req.params.id, status, result, error);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
