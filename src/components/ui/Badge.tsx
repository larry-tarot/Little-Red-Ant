import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Badge 变体样式配置
 *
 * 使用 CVA 管理状态变体，保证颜色、边框、尺寸的一致性。
 */
const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
    {
        variants: {
            variant: {
                // 默认标签：中性灰色，用于普通状态
                default: 'bg-surface-muted text-text-secondary border-border',
                // 品牌标签：主色强调
                primary: 'bg-primary-subtle text-primary border-primary/20',
                // 成功标签
                success: 'bg-success-subtle text-success border-success/20',
                // 警告标签
                warning: 'bg-warning-subtle text-warning border-warning/20',
                // 危险/错误标签
                danger: 'bg-danger-subtle text-danger border-danger/20',
                // 次级填充标签
                secondary: 'bg-secondary text-secondary-foreground border-border',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLSpanElement>,
        VariantProps<typeof badgeVariants> {}

/**
 * 状态徽章组件
 *
 * 用于展示状态、标签、角色等轻量信息。
 * 支持 default / primary / success / warning / danger / secondary 变体。
 *
 * 使用示例：
 * ```tsx
 * <Badge variant="success">已启用</Badge>
 * <Badge variant="danger">已过期</Badge>
 * ```
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant, children, ...props }, ref) => {
        return (
            <span
                ref={ref}
                className={cn(badgeVariants({ variant }), className)}
                {...props}
            >
                {children}
            </span>
        );
    }
);

Badge.displayName = 'Badge';
