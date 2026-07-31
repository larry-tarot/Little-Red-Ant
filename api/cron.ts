
import cron from 'node-cron';
import { Logger } from './services/LoggerService.js';
import { ComplianceService } from './services/core/ComplianceService.js';
import { recoverStaleTasks, enqueueTask } from './services/queue.js';
import { checkAllAccountsHealth, refreshActiveAccountCookies } from './services/rpa/auth.js';

const RECOVERY_SCHEDULE = '*/10 * * * *';

// Initialize Cron Jobs
export function initCron() {
    Logger.info('Cron', 'Initializing cron jobs...');

    // 0. Task Recovery Job (High Priority)
    cron.schedule(RECOVERY_SCHEDULE, () => {
        // Logger.debug('Cron', 'Checking for stale tasks...');
        recoverStaleTasks();
    });

    // 1. Sync Compliance Rules (Daily at 03:00 AM)
    // "0 3 * * *" = At 03:00.
    cron.schedule('0 3 * * *', async () => {
        Logger.info('Cron', 'Running scheduled compliance rules sync...');
        try {
            await ComplianceService.syncRules();
        } catch (e: any) {
            Logger.error('Cron', `Compliance rules sync failed: ${e.message}`);
        }
    });

    // 2. Account Health Check (Daily at 04:00 AM)
    cron.schedule('0 4 * * *', async () => {
        Logger.info('Cron', 'Running scheduled account health check...');
        try {
            await checkAllAccountsHealth();
        } catch (e: any) {
            Logger.error('Cron', `Account health check failed: ${e.message}`);
        }
    });

    // 3. Note Stats Sync (Daily at 06:00 AM, 12:00 PM, 18:00 PM)
    // 保证数据看板在一天内有多个数据点，避免趋势图为空
    cron.schedule('0 6,12,18 * * *', async () => {
        Logger.info('Cron', 'Running scheduled note stats sync...');
        try {
            enqueueTask('SCRAPE_STATS', {});
        } catch (e: any) {
            Logger.error('Cron', `Scheduled stats sync failed: ${e.message}`);
        }
    });

    // 4. Proactive Cookie Refresh (Every 6 hours)
    // 小红书 Cookie 长时间闲置会失效，定期访问保持活跃，降低任务执行时过期概率
    cron.schedule('0 */6 * * *', async () => {
        Logger.info('Cron', 'Running proactive cookie refresh...');
        try {
            await refreshActiveAccountCookies();
        } catch (e: any) {
            Logger.error('Cron', `Proactive cookie refresh failed: ${e.message}`);
        }
    });

    Logger.info('Cron', 'Cron jobs scheduled.');
}
