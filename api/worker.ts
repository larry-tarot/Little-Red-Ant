
import { getNextPendingTask, completeTask, failTask, taskEvents, emitTaskProgress, getTaskCategory } from './services/queue.js';
import { TaskRegistry } from './services/tasks/TaskRegistry.js';
import { taskController } from './services/tasks/TaskController.js';
import { VideoProjectService } from './services/video/VideoProjectService.js';
import { Logger } from './services/LoggerService.js';
import type { TaskProgressEvent } from './services/tasks/TaskHandler.js';

// 任务类型隔离：RPA 占用浏览器资源，AI 占用 API/计算资源，分开限制避免互相阻塞
const CATEGORY_LIMITS = {
    rpa: 2,
    ai: 3,
    general: 2
};

const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟超时

const activeWorkersByCategory: Record<string, number> = {
    rpa: 0,
    ai: 0,
    general: 0
};

function totalActiveWorkers(): number {
    return activeWorkersByCategory.rpa + activeWorkersByCategory.ai + activeWorkersByCategory.general;
}

export function startWorker() {
    Logger.info('Worker', 'Background task processor started.');
    Logger.info('Worker', `Concurrency limits: RPA=${CATEGORY_LIMITS.rpa}, AI=${CATEGORY_LIMITS.ai}, General=${CATEGORY_LIMITS.general}`);

    const processTask = async () => {
        try {
            // Attempt to fetch task (Hybrid: Memory -> DB)
            const task = getNextPendingTask();

            if (!task) return;

            const category = getTaskCategory(task.type);

            // Category-based concurrency control
            if (activeWorkersByCategory[category] >= CATEGORY_LIMITS[category]) {
                // 当前类别已满，把任务塞回内存队列并稍后重试
                // 注意：这里只是跳过本次轮询，任务仍在 DB 中等待
                return;
            }

            // Found a task, increment counter and process asynchronously
            activeWorkersByCategory[category]++;
            Logger.info('Worker', `Processing task ${task.id} (${task.type}, ${category})... Active: ${totalActiveWorkers()}`);

            const onProgress = (event: TaskProgressEvent) => {
                if (event && event.taskId === task.id) {
                    emitTaskProgress({ ...event, taskId: task.id });
                }
            };

            // 任务超时控制：5 分钟后强制取消
            const taskTimeout = setTimeout(() => {
                Logger.warn('Worker', `Task ${task.id} timed out, aborting...`);
                taskController.abort(task.id);
            }, TASK_TIMEOUT_MS);

            try {
                const signal = taskController.create(task.id);
                const handler = TaskRegistry.getHandler(task.type);
                const result = await handler.handle(task, onProgress, signal);

                completeTask(task.id, result);
                Logger.info('Worker', `Task ${task.id} completed successfully.`);

            } catch (error: any) {
                Logger.error('Worker', `Task ${task.id} failed`, error);

                if (error.message === 'TASK_CANCELLED') {
                    // 超时或用户取消：标记为 CANCELLED，不计入重试
                    const now = new Date().toISOString();
                    const db = (await import('./db.js')).default;
                    db.prepare(`UPDATE tasks SET status = 'CANCELLED', updated_at = ? WHERE id = ?`).run(now, task.id);
                } else {
                    failTask(task.id, error.message || 'Unknown error');
                }

                if (task.type === 'PUBLISH' && task.payload) {
                    try {
                        const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload;
                        if (payload.projectId) {
                            VideoProjectService.updateProjectStatus(payload.projectId, 'COMPLETED', undefined, 'FAILED');
                        }
                    } catch(_e) { /* ignore */ }
                }
            } finally {
                clearTimeout(taskTimeout);
                taskController.remove(task.id);
                activeWorkersByCategory[category]--;
                // Immediately check for more tasks after finishing one
                processTask();
            }

        } catch (e) {
            Logger.error('Worker', 'Critical error in fetching task', e);
        }
    };

    // 1. Event-Driven Trigger (Fast Path)
    taskEvents.on('new_task', () => {
        processTask();
    });

    // 2. Fallback Polling (Slow Path - for Scheduled Tasks & Recovery)
    setInterval(() => {
        processTask();
    }, 2000); // Check every 2s (Relaxed from 1s because we have event trigger now)
}
