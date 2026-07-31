import React from 'react';

/**
 * 功能描述：格式化最近同步时间并判断是否过期
 *
 * 参数说明：
 * - lastSyncAt: [string | null | undefined] ISO 格式时间字符串
 *
 * 返回说明：
 * - { text: string; isStale: boolean } text 为展示文案，isStale 表示是否超过 6 小时未同步
 */
function formatLastSync(lastSyncAt?: string | null): { text: string; isStale: boolean } {
    if (!lastSyncAt) return { text: '未同步', isStale: true };
    const syncDate = new Date(lastSyncAt);
    if (isNaN(syncDate.getTime())) return { text: '时间无效', isStale: true };

    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) return { text: `刚刚 (${syncDate.toLocaleString()})`, isStale: false };
    if (diffHours < 24) return { text: `${Math.floor(diffHours)} 小时前 (${syncDate.toLocaleString()})`, isStale: diffHours > 6 };
    return { text: `${Math.floor(diffHours / 24)} 天前 (${syncDate.toLocaleString()})`, isStale: true };
}

interface SyncStatusBarProps {
    accountName?: string;
    lastSyncAt?: string | null;
    needsSync?: boolean;
}

/**
 * 功能描述：同步状态栏组件
 *
 * 设计思路：
 * 根据后端返回的 needs_sync 与格式化后的时间，统一展示数据新鲜度。
 */
export function SyncStatusBar({ accountName, lastSyncAt, needsSync }: SyncStatusBarProps) {
    const syncInfo = formatLastSync(lastSyncAt);
    const isStale = needsSync ?? syncInfo.isStale;

    return (
        <div className={`flex items-center justify-between px-4 py-3 rounded-lg border mb-6 text-sm ${
            isStale
                ? 'bg-warning-subtle border-warning/20 text-warning'
                : 'bg-success-subtle border-success/20 text-success'
        }`}>
            <div className="flex items-center">
                <span className={`w-2 h-2 rounded-full mr-2 ${isStale ? 'bg-warning' : 'bg-success'}`} />
                <span>
                    数据状态：<span className="font-medium">{isStale ? '建议同步' : '较新'}</span>
                    {accountName && (
                        <span className="ml-2 text-text-tertiary">· 账号: {accountName}</span>
                    )}
                </span>
            </div>
            <div className="text-text-tertiary">
                最近同步: {syncInfo.text}
            </div>
        </div>
    );
}
