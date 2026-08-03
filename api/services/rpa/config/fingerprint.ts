/**
 * 按账号确定性派生浏览器指纹。
 *
 * 原则：同一 accountId 永远得到相同指纹（账号画像稳定），
 *      不同账号互不雷同（避免多账号同画像聚类）。
 * 验证：crawls-test/test_account_fingerprint.ts（1000 账号 0 碰撞，端到端生效）
 */

export interface AccountFingerprint {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    geolocation: { longitude: number; latitude: number };
    timezoneId: string;
}

function hashSeed(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const VIEWPORTS = [
    { width: 1920, height: 1080, weight: 30 },
    { width: 1366, height: 768, weight: 20 },
    { width: 1536, height: 864, weight: 20 },
    { width: 1440, height: 900, weight: 15 },
    { width: 1280, height: 800, weight: 15 },
];

const SHANGHAI_AREAS = [
    { longitude: 121.4737, latitude: 31.2304 }, // 黄浦
    { longitude: 121.4365, latitude: 31.1885 }, // 徐汇
    { longitude: 121.4244, latitude: 31.2203 }, // 静安
    { longitude: 121.3916, latitude: 31.2498 }, // 普陀
    { longitude: 121.5246, latitude: 31.2217 }, // 浦东
    { longitude: 121.4897, latitude: 31.2697 }, // 虹口
];

function pickWeighted<T extends { weight?: number }>(pool: T[], rand: () => number): T {
    const total = pool.reduce((s, x) => s + (x.weight ?? 1), 0);
    let r = rand() * total;
    for (const item of pool) {
        r -= item.weight ?? 1;
        if (r <= 0) return item;
    }
    return pool[pool.length - 1];
}

/**
 * @param seedKey 账号标识（如 `account_3`）；匿名 profile 传 'anonymous_profile'
 */
export function deriveFingerprint(seedKey: string): AccountFingerprint {
    const rand = mulberry32(hashSeed(`xhs-${seedKey}`));
    const vp = pickWeighted(VIEWPORTS, rand);
    const area = SHANGHAI_AREAS[Math.floor(rand() * SHANGHAI_AREAS.length)];
    const jitterLon = (rand() - 0.5) * 0.02;
    const jitterLat = (rand() - 0.5) * 0.02;
    return {
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        geolocation: { longitude: area.longitude + jitterLon, latitude: area.latitude + jitterLat },
        timezoneId: 'Asia/Shanghai',
    };
}
