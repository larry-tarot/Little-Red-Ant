
import { scrapeComments } from '../../rpa/comments.js';
import { TaskHandler } from '../TaskHandler.js';

export class ScrapeCommentsHandler implements TaskHandler {
    async handle(_task: any, _onProgress?: (e: any) => void, signal?: AbortSignal): Promise<any> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }
        return await scrapeComments();
    }
}
