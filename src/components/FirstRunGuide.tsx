/**
 * 首次使用引导组件 — 新用户打开首页时显示。
 * 检查是否需要引导:如果没有账号、没有笔记、没有 AI Key,则显示步骤卡片。
 * 用户完成任意步骤后,对应项自动勾选,不再显示引导。
 */
import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { Sparkles, CheckCircle, ArrowRight, Settings, User, PenTool, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Step {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  path: string;
  check: () => Promise<boolean>;
}

/**
 * 首次使用引导
 *
 * 根据用户完成度展示 4 个入门步骤，完成后自动隐藏。
 * 颜色基于 design tokens，支持主题切换。
 */
export default function FirstRunGuide() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Step[]>([]);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSteps = async () => {
      // Check if already dismissed
      const stored = sessionStorage.getItem('first-run-dismissed');
      if (stored === 'true') {
        setDismissed(true);
        setLoading(false);
        return;
      }

      const stepDefs: Step[] = [
        {
          key: 'api_key',
          icon: <Settings size={20} />,
          title: '配置 AI API Key',
          description: '填写 Aliyun 或 DeepSeek API Key,开启 AI 智能创作',
          action: '去配置',
          path: '/settings',
          check: async () => {
            try {
              const res = await axios.get('/api/settings');
              const hasKey = res.data?.aliyun_api_key || res.data?.deepseek_api_key;
              return !!hasKey;
            } catch { return false; }
          },
        },
        {
          key: 'account',
          icon: <User size={20} />,
          title: '添加小红书账号',
          description: '关联你的小红书账号,开启自动发布与数据同步',
          action: '去添加',
          path: '/accounts',
          check: async () => {
            try {
              const res = await axios.get('/api/accounts');
              return Array.isArray(res.data) && res.data.length > 0;
            } catch { return false; }
          },
        },
        {
          key: 'content',
          icon: <PenTool size={20} />,
          title: '生成第一篇笔记',
          description: '体验 AI 智能创作,一键生成小红书爆款笔记',
          action: '去创作',
          path: '/generate',
          check: async () => {
            try {
              const res = await axios.get('/api/drafts');
              return Array.isArray(res.data) && res.data.length > 0;
            } catch { return false; }
          },
        },
        {
          key: 'trends',
          icon: <TrendingUp size={20} />,
          title: '浏览热点趋势',
          description: '发现热门话题,为你的创作找到灵感',
          action: '去看看',
          path: '/gallery',
          check: async () => {
            try {
              const res = await axios.get('/api/trends?source=weibo');
              return Array.isArray(res.data?.data) && res.data.data.length > 0;
            } catch { return false; }
          },
        },
      ];

      // Check which steps are completed
      const results: Record<string, boolean> = {};
      for (const step of stepDefs) {
        results[step.key] = await step.check();
      }
      setCompleted(results);
      setSteps(stepDefs);

      // Auto-dismiss if all steps are completed
      if (Object.values(results).every(Boolean)) {
        setDismissed(true);
      }
      setLoading(false);
    };

    checkSteps();
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('first-run-dismissed', 'true');
    setDismissed(true);
  };

  const handleStep = (step: Step) => {
    navigate(step.path);
  };

  if (loading || dismissed) return null;

  const allCompleted = steps.length > 0 && steps.every(s => completed[s.key]);
  if (allCompleted) return null;

  const completedCount = steps.filter(s => completed[s.key]).length;

  return (
    <div className="bg-gradient-to-r from-primary-subtle to-surface-muted rounded-xl border border-primary/20 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-text">欢迎使用小红蚁</h2>
        </div>
        <button
          onClick={handleDismiss}
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          我知道了
        </button>
      </div>

      <p className="text-sm text-text-secondary mb-4">
        完成以下步骤,快速上手:
        <span className="ml-2 text-primary font-medium">
          {completedCount}/{steps.length}
        </span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map((step) => {
          const done = completed[step.key];
          return (
            <button
              key={step.key}
              onClick={() => !done && handleStep(step)}
              disabled={done}
              className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                done
                  ? 'bg-success-subtle cursor-default'
                  : 'bg-surface hover:bg-primary-subtle hover:border-primary/30 border border-border cursor-pointer'
              }`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                done ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary'
              }`}>
                {done ? <CheckCircle size={16} /> : step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? 'text-success line-through' : 'text-text'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-text-secondary truncate">{step.description}</p>
              </div>
              {!done && <ArrowRight size={16} className="text-text-tertiary flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
