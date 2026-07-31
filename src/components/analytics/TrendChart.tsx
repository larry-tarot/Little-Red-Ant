import React from 'react';
import { TrendingUp } from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';

interface TrendChartProps {
    data: any[];
}

/**
 * 功能描述：近 30 天流量趋势图（美化版）
 *
 * 设计思路：
 * - X/Y 轴无刻度线、统一 tertiary 色，与 Home 页图表风格一致
 * - 双面积渐变填充，阅读量用 primary，互动量用 success
 * - Area 带 hover 圆点 + 过渡动画，提升交互感
 * - Tooltip 统一圆角阴影样式
 * - Legend 简洁，去掉啰嗦的「总互动 (赞+藏+评)」
 */
export function TrendChart({ data }: TrendChartProps) {
    return (
        <div className="bg-surface rounded-lg shadow-sm border border-border p-6 mb-8">
            <h3 className="text-lg font-medium text-text mb-6 flex items-center">
                <TrendingUp className="mr-2 text-primary" size={20} />
                近30天流量趋势
            </h3>
            {data.length > 0 ? (
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorInteraction" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                                dy={8}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                                width={50}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '8px',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                                    fontSize: '13px'
                                }}
                                labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
                                cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '4 4' }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                                formatter={(value: string) =>
                                    value === 'views' ? '阅读量' : '互动量'
                                }
                            />
                            <Area
                                type="monotone"
                                dataKey="views"
                                stroke="var(--primary)"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#colorViews)"
                                isAnimationActive={true}
                                animationDuration={1000}
                                dot={false}
                                activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--primary)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="interaction"
                                stroke="var(--success)"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#colorInteraction)"
                                isAnimationActive={true}
                                animationDuration={1000}
                                dot={false}
                                activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--success)' }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-64 flex flex-col items-center justify-center text-text-tertiary bg-surface-muted rounded-lg">
                    <TrendingUp size={48} className="mb-2 opacity-50" />
                    <p>暂无历史趋势数据 (需等待定时任务运行)</p>
                </div>
            )}
        </div>
    );
}
