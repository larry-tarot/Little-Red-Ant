
import { checkAllAccountsHealth } from '../../rpa/auth.js';
import { TaskHandler } from '../TaskHandler.js';

export class HealthCheckHandler implements TaskHandler {
    async handle(_task: any, _onProgress?: (e: any) => void, signal?: AbortSignal): Promise<any> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }
        console.log('[Worker] Running full health check...');
        await checkAllAccountsHealth();
        return { success: true };
    }
}
