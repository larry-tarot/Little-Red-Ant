import { LucideIcon, Box, Lightbulb } from 'lucide-react';

interface Step {
    text: string;
    icon?: LucideIcon;
}

interface EmptyStateProps {
    title?: string;
    description?: string;
    icon?: LucideIcon;
    action?: React.ReactNode;
    steps?: Step[];
    tip?: string;
}

/**
 * 空状态组件 — 引导用户开始使用
 *
 * 使用示例：
 * <EmptyState
 *   title="暂无对标账号"
 *   description="添加对标账号，系统将自动监控其更新并拆解爆款。"
 *   icon={Target}
 *   action={<Button>添加第一个账号</Button>}
 *   steps={[...]}
 *   tip="支持批量添加，一次最多 10 个链接"
 * />
 */
export default function EmptyState({
    title = '暂无数据',
    description = '这里空空如也，快去添加一些内容吧',
    icon: Icon = Box,
    action,
    steps,
    tip
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-surface rounded-xl border border-dashed border-border text-center">
            <div className="bg-surface-muted p-4 rounded-full mb-4">
                <Icon className="text-text-tertiary" size={32} />
            </div>
            <h3 className="text-lg font-medium text-text mb-1">{title}</h3>
            <p className="text-sm text-text-secondary max-w-sm mb-6">{description}</p>

            {/* 操作按钮 */}
            {action && <div className="mb-6">{action}</div>}

            {/* 步骤引导 */}
            {steps && steps.length > 0 && (
                <div className="w-full max-w-md mb-6">
                    <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">
                        操作步骤
                    </div>
                    <div className="space-y-2">
                        {steps.map((step, index) => (
                            <div
                                key={index}
                                className="flex items-center text-sm text-text-secondary bg-surface-muted rounded-lg px-4 py-3"
                            >
                                <span className="w-6 h-6 rounded-full bg-primary-subtle text-primary text-xs font-medium flex items-center justify-center mr-3 flex-shrink-0">
                                    {index + 1}
                                </span>
                                <span className="flex-1 text-left">{step.text}</span>
                                {step.icon && <step.icon size={16} className="text-text-tertiary ml-2" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 小贴士 */}
            {tip && (
                <div className="flex items-start max-w-md text-left bg-warning-subtle border border-warning/20 rounded-lg px-4 py-3">
                    <Lightbulb size={16} className="text-warning mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-warning">{tip}</span>
                </div>
            )}
        </div>
    );
}

/**
 * 简洁版空状态（用于小空间）
 */
export function EmptyStateCompact({
    title = '暂无数据',
    description,
    action
}: {
    title?: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="bg-surface-muted p-3 rounded-full mb-3">
                <Box className="text-text-tertiary" size={24} />
            </div>
            <h3 className="text-sm font-medium text-text mb-1">{title}</h3>
            {description && (
                <p className="text-xs text-text-secondary mb-3">{description}</p>
            )}
            {action}
        </div>
    );
}

/**
 * 引导卡片（用于页面内嵌引导）
 */
export function GuideCard({
    title,
    description,
    action,
    icon: Icon = Lightbulb
}: {
    title: string;
    description: string;
    action?: React.ReactNode;
    icon?: LucideIcon;
}) {
    return (
        <div className="bg-primary-subtle/50 border border-primary/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
                <div className="bg-primary-subtle p-2 rounded-lg">
                    <Icon size={24} className="text-primary" />
                </div>
                <div className="flex-1">
                    <h4 className="font-medium text-text mb-1">{title}</h4>
                    <p className="text-sm text-text-secondary mb-3">{description}</p>
                    {action}
                </div>
            </div>
        </div>
    );
}
