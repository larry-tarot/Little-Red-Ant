/**
 * 骨架屏组件 — 页面加载时的占位动画
 */
import React from 'react';

function SkeletonBar({ className = '' }: { className?: string }) {
    return (
        <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
    );
}

export function StatsCardSkeleton() {
    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
                <SkeletonBar className="w-8 h-8" />
                <SkeletonBar className="w-12 h-4" />
            </div>
            <SkeletonBar className="w-20 h-7 mb-1" />
            <SkeletonBar className="w-16 h-3" />
        </div>
    );
}

export function ChartSkeleton() {
    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <SkeletonBar className="w-32 h-5 mb-4" />
            <div className="flex items-end gap-2 h-40">
                {[40, 60, 45, 80, 55, 70, 65].map((h, i) => (
                    <div key={i} className="flex-1 bg-gray-200 rounded-t animate-pulse" style={{ height: `${h}%` }} />
                ))}
            </div>
        </div>
    );
}

export function HomePageSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <SkeletonBar className="w-48 h-7 mb-2" />
                <SkeletonBar className="w-64 h-4" />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <StatsCardSkeleton key={i} />)}
            </div>

            {/* Chart */}
            <ChartSkeleton />

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <SkeletonBar className="w-32 h-5 mb-4" />
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0">
                        <SkeletonBar className="w-8 h-8 rounded-full" />
                        <div className="flex-1">
                            <SkeletonBar className="w-3/4 h-4 mb-1" />
                            <SkeletonBar className="w-1/2 h-3" />
                        </div>
                        <SkeletonBar className="w-16 h-4" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default HomePageSkeleton;