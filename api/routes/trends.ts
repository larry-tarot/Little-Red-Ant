import { Router } from 'express';
import { enqueueTask } from '../services/queue.js';
import { TrendService } from '../services/core/TrendService.js';
import { validateQuery } from '../middleware/validation.js';
import { TrendsQuerySchema } from '../schemas/index.js';

const router = Router();

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Mock fallback
const MOCK_TRENDS = [
    { id: 10, title: '近期热门话题', hot_value: 50000 },
    { id: 11, title: '新人博主流量密码', hot_value: 45000 },
    { id: 12, title: '小红书涨粉技巧', hot_value: 40000 },
];

router.get('/', validateQuery(TrendsQuerySchema), async (req, res) => {
    try {
        const { source = 'weibo', refresh: forceRefresh = false } = req.query as any;
        const now = Date.now();

        // 抖音来源暂时下线(Web 端反爬极严,Sprint 1 决定:返回空数据,避免空 tab 体验)
        // See PROJECT_STATUS.md for decision context.
        // UI side has already hidden the douyin tab in src/components/HotTrends.tsx;
        // this guard protects any direct API callers.
        if (source === 'douyin') {
            return res.json({
                source: 'douyin',
                updatedAt: now,
                data: [],
                status: 'FRESH'
            });
        }

        // 1. 从 Service 获取数据
        const row = TrendService.getTrendsBySource(source);
        const data = row ? JSON.parse(row.data) : [];

        // Convert UTC/Server time to timestamp if needed, but Date(row.updated_at) should work if format is standard
        // sqlite CURRENT_TIMESTAMP is UTC 'YYYY-MM-DD HH:MM:SS'
        // new Date('YYYY-MM-DD HH:MM:SS') treats as local time in some environments or UTC in others.
        // Better to rely on relative check or just accept slight skew.

        // Check staleness (offset by timezone if needed, but relative diff is usually safe if consistent)
        // Actually, Date.now() is UTC. sqlite CURRENT_TIMESTAMP is UTC.
        // new Date(string + 'Z') enforces UTC.
        const lastUpdateTs = row ? new Date(row.updated_at + 'Z').getTime() : 0;
        const isStale = (now - lastUpdateTs) > CACHE_DURATION;

        // 2. Trigger Background Update if needed
        if (forceRefresh || !row || isStale) {
            // Check if task already running
            const isAlreadyQueued = TrendService.isTrendScrapeTaskQueued(source);

            if (!isAlreadyQueued) {
                console.log(`Triggering background scrape for ${source} (Stale: ${isStale}, Force: ${forceRefresh})`);
                enqueueTask('SCRAPE_TRENDS', { source });
            }
        }

        // 3. Return Response
        if (!row && data.length === 0) {
            // Fallback to mock if we have absolutely nothing in DB
            return res.json({
                source: 'mock',
                updatedAt: now,
                data: MOCK_TRENDS,
                status: 'UPDATING'
            });
        }

        return res.json({
            source: source,
            updatedAt: lastUpdateTs,
            data: data,
            status: isStale ? 'UPDATING' : 'FRESH'
        });

    } catch (error) {
        console.error('Error fetching trends:', error);
        // Fallback to mock
        res.json({
            source: 'mock',
            updatedAt: Date.now(),
            data: MOCK_TRENDS
        });
    }
});

export default router;
