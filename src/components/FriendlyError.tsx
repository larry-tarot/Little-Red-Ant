import { AlertTriangle, Info, XCircle } from 'lucide-react';

interface FriendlyErrorData {
    code?: string;
    title: string;
    message: string;
    suggestion: string;
    severity: 'error' | 'warning' | 'info';
}

interface FriendlyErrorAction {
    label: string;
    onClick: () => void;
}

interface FriendlyErrorProps {
    error: FriendlyErrorData | null;
    onRetry?: () => void;
    action?: FriendlyErrorAction;
    className?: string;
}

/**
 * 严重级别样式配置
 *
 * 统一使用 design tokens，保证亮色/暗色主题下的一致性。
 */
const severityConfig = {
    error: {
        icon: XCircle,
        bgColor: 'bg-danger-subtle',
        borderColor: 'border-danger/20',
        iconColor: 'text-danger',
        titleColor: 'text-danger',
        textColor: 'text-danger'
    },
    warning: {
        icon: AlertTriangle,
        bgColor: 'bg-warning-subtle',
        borderColor: 'border-warning/20',
        iconColor: 'text-warning',
        titleColor: 'text-warning',
        textColor: 'text-warning'
    },
    info: {
        icon: Info,
        bgColor: 'bg-primary-subtle',
        borderColor: 'border-primary/20',
        iconColor: 'text-primary',
        titleColor: 'text-primary',
        textColor: 'text-primary'
    }
};

/**
 * 友好错误提示组件
 *
 * 根据错误严重级别展示带图标的提示卡片，支持重试操作。
 */
export default function FriendlyError({ error, onRetry, action, className = '' }: FriendlyErrorProps) {
    if (!error) return null;

    const config = severityConfig[error.severity] || severityConfig.error;
    const Icon = config.icon;

    return (
        <div className={`rounded-lg border p-4 ${config.bgColor} ${config.borderColor} ${className}`}>
            <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
                <div className="flex-1 min-w-0">
                    <h4 className={`font-medium text-sm ${config.titleColor}`}>
                        {error.title}
                    </h4>
                    <p className={`text-sm mt-1 ${config.textColor}`}>
                        {error.message}
                    </p>
                    {error.suggestion && (
                        <div className={`mt-3 text-sm ${config.textColor} opacity-90`}>
                            <span className="font-medium">建议：</span>
                            <p className="mt-1">{error.suggestion}</p>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        {onRetry && (
                            <button
                                onClick={onRetry}
                                className={`px-3 py-1.5 text-sm rounded-md transition-colors
                                    ${error.severity === 'error'
                                        ? 'bg-danger-subtle hover:bg-danger/10 text-danger'
                                        : error.severity === 'warning'
                                            ? 'bg-warning-subtle hover:bg-warning/10 text-warning'
                                            : 'bg-primary-subtle hover:bg-primary/10 text-primary'
                                    }`}
                            >
                                重试
                            </button>
                        )}
                        {action && (
                            <button
                                onClick={action.onClick}
                                className="px-3 py-1.5 text-sm rounded-md transition-colors bg-surface border border-border-strong text-text hover:bg-surface-muted"
                            >
                                {action.label}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * 简洁版错误提示（用于列表项等紧凑场景）
 */
export function FriendlyErrorBadge({ error }: { error: FriendlyErrorData | null }) {
    if (!error) return null;

    const config = severityConfig[error.severity];
    const Icon = config.icon;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${config.bgColor} ${config.textColor}`}>
            <Icon className={`w-3.5 h-3.5 ${config.iconColor}`} />
            <span className="truncate max-w-[200px]">{error.title}</span>
        </div>
    );
}
