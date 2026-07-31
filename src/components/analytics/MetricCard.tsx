import React from 'react';

/**
 * 功能描述：数据看板指标卡片组件
 *
 * 设计思路：
 * 将四张汇总卡片统一封装，保证样式、间距、hover 效果一致，
 * 避免主组件中重复编写相同的 div 结构。
 *
 * 参数说明：
 * - label: [string] 指标名称
 * - value: [string | number] 指标数值
 * - icon: [React.ReactNode] 图标元素
 * - badge: [string | undefined] 右上角徽章文案
 * - colorClass: [string] 图标背景与颜色类名
 */
export interface MetricCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    badge?: string;
    colorClass?: string;
}

export function MetricCard({
    label,
    value,
    icon,
    badge,
    colorClass = 'bg-primary-subtle text-primary'
}: MetricCardProps) {
    return (
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${colorClass}`}>
                    {icon}
                </div>
                {badge && (
                    <span className="text-xs font-medium text-text-tertiary bg-surface-muted px-2 py-0.5 rounded-full">
                        {badge}
                    </span>
                )}
            </div>
            <p className="text-2xl font-bold text-text">{value}</p>
            <p className="text-sm text-text-tertiary mt-1">{label}</p>
        </div>
    );
}
