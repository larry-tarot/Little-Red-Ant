import React from 'react';
import { Heart, MessageCircle, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis } from 'recharts';
import type { EngagementStats } from './types';

const COLORS = {
    PRAISE: 'var(--success)',
    COMPLAINT: 'var(--danger)',
    INQUIRY: 'var(--primary)',
    OTHER: 'var(--text-tertiary)'
};

const INTENT_LABELS: Record<string, string> = {
    PRAISE: '夸奖',
    INQUIRY: '询单',
    COMPLAINT: '吐槽',
    OTHER: '其他'
};

interface EngagementPanelProps {
    engagement: EngagementStats | null;
}

/**
 * 功能描述：互动分析面板
 *
 * 设计思路：
 * 将互动响应率、评论意图分布、近 7 天新增评论三个模块组合展示，
 * 与主页面解耦，便于独立维护与复用。
 */
export function EngagementPanel({ engagement }: EngagementPanelProps) {
    if (!engagement) return null;

    const pieData = Object.entries(engagement.intents).map(([key, value]) => ({
        name: INTENT_LABELS[key] || key,
        value,
        key
    }));

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* 互动响应率 */}
            {engagement.replyStats && (
                <div className="bg-surface rounded-lg shadow-sm border border-border p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-medium text-text mb-2 flex items-center">
                            <MessageCircle className="mr-2 text-primary" size={20} />
                            互动响应率
                        </h3>
                        <p className="text-sm text-text-tertiary">已回复评论占比</p>
                    </div>
                    <div className="mt-4 flex items-end">
                        <span className="text-4xl font-bold text-text">{engagement.replyStats.rate ?? 0}%</span>
                        <span className="text-sm text-text-tertiary ml-2 mb-1">
                            ({engagement.replyStats.replied ?? 0} / {engagement.replyStats.total ?? 0})
                        </span>
                    </div>
                    <div className="w-full bg-surface-hover rounded-full h-2.5 mt-4">
                        <div
                            className="bg-primary h-2.5 rounded-full"
                            style={{ width: `${engagement.replyStats.rate ?? 0}%` }}
                        />
                    </div>
                </div>
            )}

            {/* 评论意图分布 */}
            <div className="bg-surface rounded-lg shadow-sm border border-border p-6">
                <h3 className="text-lg font-medium text-text mb-4 flex items-center">
                    <Heart className="mr-2 text-primary" size={20} />
                    评论意图分布
                </h3>
                <div className="h-48 w-full flex items-center">
                    <ResponsiveContainer width="60%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={60}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry) => (
                                    <Cell key={entry.key} fill={COLORS[entry.key as keyof typeof COLORS]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col space-y-2 text-sm w-[40%] pl-2">
                        {pieData.map((entry) => (
                            <div key={entry.key} className="flex items-center">
                                <span
                                    className="w-3 h-3 rounded-full mr-2"
                                    style={{ backgroundColor: COLORS[entry.key as keyof typeof COLORS] }}
                                />
                                {entry.name}: {entry.value}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 近 7 天新增评论 */}
            <div className="bg-surface rounded-lg shadow-sm border border-border p-6">
                <h3 className="text-lg font-medium text-text mb-4 flex items-center">
                    <TrendingUp className="mr-2 text-success" size={20} />
                    近7天新增评论
                </h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={engagement.dailyTrend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(v) => v.substring(5)}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}
                                cursor={{ fill: 'transparent' }}
                            />
                            <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} name="评论数" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
