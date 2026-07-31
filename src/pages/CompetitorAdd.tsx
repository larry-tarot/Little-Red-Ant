
import React, { useState } from 'react';
import { ArrowLeft, Search, Target, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components/ui';

export default function CompetitorAdd() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
        toast.error('请输入小红书主页链接或 User ID');
        return;
    }

    // Basic validation
    if (!url.includes('xiaohongshu.com') && url.length < 10) {
        toast.error('请输入有效的小红书个人主页链接或 User ID');
        return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/competitors/analyze', { url });
      if (res.data.success) {
          toast.success('已添加到任务队列，正在后台分析...');
          // Give a small delay so user reads the message
          setTimeout(() => {
              navigate('/competitor');
          }, 1500);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || '添加失败');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/competitor" className="inline-flex items-center text-text-tertiary hover:text-text mb-6">
          <ArrowLeft size={20} className="mr-2" />
          返回列表
        </Link>

        <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border bg-surface-muted/50">
            <h1 className="text-xl font-bold text-text flex items-center">
              <Target className="mr-2 text-primary" />
              添加对标账号 (Add Competitor)
            </h1>
            <p className="text-text-tertiary text-sm mt-1">
              输入小红书博主的主页链接或 ID，系统将自动抓取数据并进行 AI 分析。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                主页链接 / User ID
              </label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={18} />
                <Input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="例如：https://www.xiaohongshu.com/user/profile/5ff..."
                  className="pl-10 pr-4 py-3"
                />
              </div>
              <p className="mt-2 text-xs text-text-tertiary flex items-center">
                <AlertCircle size={12} className="mr-1" />
                提示：在小红书 App 中点击分享 -&gt; 复制链接
              </p>
            </div>

            <div className="bg-primary-subtle border border-primary-subtle rounded-lg p-4 text-sm text-primary">
              <h4 className="font-bold mb-2">AI 分析将包含：</h4>
              <ul className="list-disc list-inside space-y-1 text-primary">
                <li>账号基础数据（粉丝、笔记数）</li>
                <li>最近 20 篇笔记的互动数据</li>
                <li><strong>内容策略拆解</strong>（人设、风格）</li>
                <li><strong>爆款关键词提取</strong></li>
                <li><strong>可执行的模仿建议</strong></li>
              </ul>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                loading={loading}
                className="w-full text-base"
                size="lg"
              >
                {!loading && <Search className="mr-2 h-5 w-5" />}
                开始 AI 分析
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
