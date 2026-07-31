/**
 * 任务进度组件 - 显示任务执行进度和步骤
 *
 * 功能：
 * 1. 进度条显示整体进度
 * 2. 步骤列表显示当前执行步骤
 * 3. 状态图标和文字说明
 *
 * 使用示例：
 * <TaskProgress
 *   status="PROCESSING"
 *   progress={60}
 *   currentStep="正在提取数据..."
 *   steps={['准备', '访问页面', '提取数据', '分析']}
 *   currentStepIndex={2}
 * />
 */

import React from 'react';
import { CheckCircle2, Circle, Loader2, Clock, AlertCircle } from 'lucide-react';

interface TaskProgressProps {
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress?: number;
    currentStep?: string;
    steps?: string[];
    currentStepIndex?: number;
    error?: string;
    className?: string;
}

/**
 * 任务状态样式配置
 *
 * 统一使用 design tokens（primary / success / warning / danger / text-tertiary），
 * 保持与全局主题一致。
 */
const statusConfig = {
    PENDING: {
        color: 'text-text-tertiary',
        bgColor: 'bg-surface-muted',
        barColor: 'bg-border-strong',
        icon: Clock,
        label: '等待中'
    },
    PROCESSING: {
        color: 'text-primary',
        bgColor: 'bg-primary-subtle',
        barColor: 'bg-primary',
        icon: Loader2,
        label: '执行中'
    },
    COMPLETED: {
        color: 'text-success',
        bgColor: 'bg-success-subtle',
        barColor: 'bg-success',
        icon: CheckCircle2,
        label: '已完成'
    },
    FAILED: {
        color: 'text-danger',
        bgColor: 'bg-danger-subtle',
        barColor: 'bg-danger',
        icon: AlertCircle,
        label: '失败'
    },
    CANCELLED: {
        color: 'text-text-tertiary',
        bgColor: 'bg-surface-muted',
        barColor: 'bg-border-strong',
        icon: AlertCircle,
        label: '已取消'
    }
};

export default function TaskProgress({
    status,
    progress = 0,
    currentStep,
    steps = [],
    currentStepIndex = -1,
    error,
    className = ''
}: TaskProgressProps) {
    const config = statusConfig[status] || statusConfig.PENDING;
    const StatusIcon = config.icon;
    const _isRunning = status === 'PENDING' || status === 'PROCESSING';

    // 计算实际进度
    const displayProgress = status === 'COMPLETED' ? 100 : Math.min(Math.max(progress, 0), 100);

    return (
        <div className={`space-y-3 ${className}`}>
            {/* 进度条 */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                        <StatusIcon
                            size={14}
                            className={`${config.color} ${status === 'PROCESSING' ? 'animate-spin' : ''}`}
                        />
                        <span className={`font-medium ${config.color}`}>
                            {config.label}
                        </span>
                        {currentStep && status === 'PROCESSING' && (
                            <span className="text-text-tertiary ml-1">· {currentStep}</span>
                        )}
                    </div>
                    <span className="text-text-tertiary">{Math.round(displayProgress)}%</span>
                </div>
                <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${config.barColor}`}
                        style={{ width: `${displayProgress}%` }}
                    />
                </div>
            </div>

            {/* 步骤列表 */}
            {steps.length > 0 && (
                <div className="flex items-center gap-1 text-xs">
                    {steps.map((step, index) => {
                        const isCompleted = index < currentStepIndex;
                        const isCurrent = index === currentStepIndex && status === 'PROCESSING';
                        const _isPending = index > currentStepIndex;

                        return (
                            <React.Fragment key={index}>
                                <div className="flex items-center">
                                    {isCompleted ? (
                                        <CheckCircle2 size={12} className="text-success" />
                                    ) : isCurrent ? (
                                        <Loader2 size={12} className="text-primary animate-spin" />
                                    ) : (
                                        <Circle size={12} className="text-border-strong" />
                                    )}
                                    <span
                                        className={`ml-1 ${
                                            isCompleted
                                                ? 'text-success'
                                                : isCurrent
                                                    ? 'text-primary font-medium'
                                                    : 'text-text-tertiary'
                                        }`}
                                    >
                                        {step}
                                    </span>
                                </div>
                                {index < steps.length - 1 && (
                                    <div
                                        className={`w-4 h-px mx-1 ${
                                            isCompleted ? 'bg-success/30' : 'bg-border'
                                        }`}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* 错误信息 */}
            {error && status === 'FAILED' && (
                <div className="text-xs text-danger bg-danger-subtle rounded px-2 py-1.5">
                    {error}
                </div>
            )}
        </div>
    );
}

/**
 * 简洁版任务状态（用于列表项）
 */
export function TaskStatusBadge({
    status,
    progress = 0
}: {
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress?: number;
}) {
    const config = statusConfig[status] || statusConfig.PENDING;
    const StatusIcon = config.icon;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${config.bgColor}`}>
            <StatusIcon
                size={12}
                className={`${config.color} ${status === 'PROCESSING' ? 'animate-spin' : ''}`}
            />
            <span className={config.color}>{config.label}</span>
            {status === 'PROCESSING' && progress > 0 && (
                <span className="text-text-tertiary">{Math.round(progress)}%</span>
            )}
        </div>
    );
}

/**
 * 任务类型标签
 *
 * 使用 design tokens 的 subtle 背景 + 文字色组合，保持视觉区分度。
 */
export function TaskTypeLabel({ type }: { type: string }) {
    const typeNames: Record<string, string> = {
        'PUBLISH': '发布笔记',
        'SCRAPE_STATS': '同步数据',
        'SCRAPE_COMMENTS': '抓取评论',
        'SCRAPE_TRENDS': '抓取热点',
        'SCRAPE_COMPETITOR': '更新对标账号',
        'GENERATE_CONTENT': 'AI生成文案',
        'GENERATE_IMAGE': 'AI生成配图',
        'GENERATE_VIDEO': 'AI生成视频'
    };

    const typeColors: Record<string, string> = {
        'PUBLISH': 'bg-primary-subtle text-primary',
        'SCRAPE_STATS': 'bg-primary-subtle text-primary',
        'SCRAPE_COMMENTS': 'bg-warning-subtle text-warning',
        'SCRAPE_TRENDS': 'bg-warning-subtle text-warning',
        'SCRAPE_COMPETITOR': 'bg-danger-subtle text-danger',
        'GENERATE_CONTENT': 'bg-success-subtle text-success',
        'GENERATE_IMAGE': 'bg-primary-subtle text-primary',
        'GENERATE_VIDEO': 'bg-danger-subtle text-danger'
    };

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColors[type] || 'bg-surface-muted text-text-secondary'}`}>
            {typeNames[type] || type}
        </span>
    );
}
