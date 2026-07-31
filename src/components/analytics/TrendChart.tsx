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
 * 功能描述：近 30 天流量趋势图
 *
 * 设计思路：
 * 使用面积图展示阅读量与总互动量趋势，与主页面解耦。
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
                        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorInteraction" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" />
                            <YAxis />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}
                                labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="views"
                                name="总阅读量"
                                stroke="var(--primary)"
                                fillOpacity={1}
                                fill="url(#colorViews)"
                            />
                            <Area
                                type="monotone"
                                dataKey="interaction"
                                name="总互动 (赞+藏+评)"
                                stroke="var(--success)"
                                fillOpacity={1}
                                fill="url(#colorInteraction)"
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
