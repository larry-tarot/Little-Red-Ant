import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { TrendingUp, Flame, RefreshCw } from 'lucide-react';

interface Trend {
  id: number;
  title: string;
  hot_value?: number;
  rank?: number;
}

interface TrendSidebarProps {
  onSelectTopic: (topic: string) => void;
}

const sourceConfig: Record<string, { name: string; color: string; icon: React.ReactNode }> = {
  weibo: { 
    name: '微博', 
    color: 'text-danger',
    icon: <Flame size={14} />
  },
  baidu: { 
    name: '百度', 
    color: 'text-primary',
    icon: <TrendingUp size={14} />
  },
  douyin: { 
    name: '抖音', 
    color: 'text-primary',
    icon: <Flame size={14} />
  },
  zhihu: { 
    name: '知乎', 
    color: 'text-primary',
    icon: <TrendingUp size={14} />
  },
};

export default function TrendSidebar({ onSelectTopic }: TrendSidebarProps) {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [trendSource, setTrendSource] = useState('weibo');
  const [loading, setLoading] = useState(false);
  const [selectedTrend, setSelectedTrend] = useState<string | null>(null);

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/trends?source=${trendSource}`);
      setTrends(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch trends:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendSource]);

  const handleSelect = (title: string) => {
    setSelectedTrend(title);
    onSelectTopic(title);
  };

  const getRankStyle = (rank?: number) => {
    if (!rank) return 'bg-surface-muted text-text-tertiary';
    if (rank === 1) return 'bg-danger text-primary-text';
    if (rank === 2) return 'bg-warning text-primary-text';
    if (rank === 3) return 'bg-warning text-primary-text';
    return 'bg-surface-muted text-text-tertiary';
  };

  const formatHotValue = (value?: number) => {
    if (!value) return '';
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toString();
  };

  const _sourceInfo = sourceConfig[trendSource];

  return (
    <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-danger-subtle to-warning-subtle">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-text flex items-center">
            <TrendingUp size={16} className="mr-2 text-danger" />
            热点灵感
          </h3>
          <button
            onClick={fetchTrends}
            disabled={loading}
            className="p-1.5 rounded-full hover:bg-white/80 text-text-tertiary hover:text-danger transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        
        {/* Source Tabs */}
        <div className="flex gap-1 mt-3">
          {Object.entries(sourceConfig).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setTrendSource(key)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                trendSource === key 
                  ? 'bg-surface text-text shadow-sm' 
                  : 'text-text-tertiary hover:bg-white/50'
              }`}
            >
              {config.name}
            </button>
          ))}
        </div>
      </div>
      
      {/* Trends List */}
      <div className="max-h-[500px] overflow-y-auto">
        {trends.length > 0 ? (
          <div className="divide-y divide-border">
            {trends.slice(0, 15).map((trend, index) => (
              <button
                key={trend.id}
                type="button"
                onClick={() => handleSelect(trend.title)}
                className={`w-full text-left p-3 hover:bg-surface-muted transition-all group ${
                  selectedTrend === trend.title ? 'bg-primary-subtle border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank Badge */}
                  <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-bold rounded ${
                    getRankStyle(trend.rank || index + 1)
                  }`}>
                    {trend.rank || index + 1}
                  </span>
                  
                  {/* Title */}
                  <span className={`flex-1 text-sm truncate ${
                    selectedTrend === trend.title ? 'text-primary font-medium' : 'text-text-secondary'
                  }`}>
                    {trend.title}
                  </span>
                  
                  {/* Hot Value */}
                  {trend.hot_value && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-xs text-text-tertiary">
                      <Flame size={12} className={trend.hot_value > 500000 ? 'text-danger' : 'text-text-tertiary'} />
                      {formatHotValue(trend.hot_value)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-text-tertiary">
            <TrendingUp size={32} className="mx-auto mb-3 text-text-tertiary" />
            <p className="text-sm">暂无热点数据</p>
            <p className="text-xs mt-1 text-text-tertiary">请尝试切换其他平台</p>
          </div>
        )}
      </div>
      
      {/* Footer */}
      {trends.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-surface-muted">
          <p className="text-xs text-text-tertiary text-center">
            点击热点可直接填入创作主题
          </p>
        </div>
      )}
    </div>
  );
}
