import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Button 变体样式配置
 *
 * 使用 class-variance-authority（CVA）管理变体，确保类型安全、组合可预测，
 * 与 shadcn/ui 的 Button 组件模式保持一致。
 */
const buttonVariants = cva(
    // 基础样式：所有变体共享的布局、圆角、焦点环、禁用状态
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-ring/50 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed',
    {
        variants: {
            variant: {
                // 主按钮：品牌色填充，用于页面主要操作
                primary: 'bg-primary text-primary-text hover:bg-primary-hover shadow-sm',
                // 次级按钮：浅色背景，用于次要操作
                secondary: 'bg-surface-muted text-text hover:bg-surface-hover',
                // 描边按钮：边框样式，用于辅助操作
                outline: 'border border-border bg-transparent text-text hover:bg-surface-muted',
                // 幽灵按钮：透明背景，悬停显示背景
                ghost: 'text-text-secondary hover:bg-surface-muted hover:text-text',
                // 危险按钮：破坏性操作
                danger: 'bg-danger text-primary-text hover:bg-danger/90 shadow-sm',
            },
            size: {
                sm: 'px-3 py-1.5 text-xs',
                md: 'px-4 py-2 text-sm',
                lg: 'px-5 py-2.5 text-base',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    /**
     * 是否显示加载状态
     * 加载时按钮自动禁用，并显示旋转指示器
     */
    loading?: boolean;
}

/**
 * 通用按钮组件
 *
 * 基于 shadcn/ui 的 CVA 变体系统实现，提供类型安全的 variant/size 组合，
 * 支持 loading 状态和外部 className 覆盖。
 *
 * 使用示例：
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleSave}>
 *   保存
 * </Button>
 *
 * <Button variant="outline" loading={isSubmitting}>
 *   提交中
 * </Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, loading = false, children, disabled, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(buttonVariants({ variant, size }), className)}
                disabled={disabled || loading}
                {...props}
            >
                {loading && (
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
