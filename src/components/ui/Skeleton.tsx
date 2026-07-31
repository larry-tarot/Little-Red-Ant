import React from 'react';
import { cn } from '@/lib/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * 骨架屏脉冲块
 *
 * 用于数据加载时的占位动画，颜色跟随当前主题。
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
    return (
        <div
            className={cn('animate-pulse rounded-md bg-surface-muted', className)}
            {...props}
        />
    );
}

/**
 * 统计卡片骨架屏
 */
export function StatsCardSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="mb-1 h-7 w-20" />
            <Skeleton className="h-3 w-16" />
        </div>
    );
}

/**
 * 图表骨架屏
 */
export function ChartSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="flex h-40 items-end gap-2">
                {[40, 60, 45, 80, 55, 70, 65].map((h, i) => (
                    <div
                        key={i}
                        className="flex-1 animate-pulse rounded-t bg-surface-muted"
                        style={{ height: `${h}%` }}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * 首页完整骨架屏
 */
export function HomePageSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <Skeleton className="mb-2 h-7 w-48" />
                <Skeleton className="h-4 w-64" />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <StatsCardSkeleton key={i} />
                ))}
            </div>

            {/* Chart */}
            <ChartSkeleton />

            {/* Table */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <Skeleton className="mb-4 h-5 w-32" />
                {[1, 2, 3, 4, 5].map((i) => (
                    <div
                        key={i}
                        className="flex items-center gap-4 border-b border-border py-3 last:border-0"
                    >
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1">
                            <Skeleton className="mb-1 h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="h-4 w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default HomePageSkeleton;
