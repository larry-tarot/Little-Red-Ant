
import { scrapeCompetitor } from '../../rpa/competitor.js';
import { TaskHandler } from '../TaskHandler.js';

export class ScrapeCompetitorHandler implements TaskHandler {
    async handle(task: any, onProgress?: (event: any) => void, signal?: AbortSignal): Promise<any> {
        // 简单进度上报
        if (onProgress) {
            onProgress({ taskId: task.id, progress: 10, stage: '启动抓取' });
        }

        // 检查是否已取消
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }

        // 调用抓取逻辑，传入 signal 以便内部可以检查取消
        const result = await scrapeCompetitor(task.payload, signal);

        if (onProgress) {
            onProgress({ taskId: task.id, progress: 100, stage: '完成' });
        }

        return result;
    }
}
