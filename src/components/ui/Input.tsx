import React from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * 通用输入框组件
 *
 * 统一了边框、聚焦状态、背景色，支持外部 className 覆盖。
 *
 * 使用示例：
 * <Input placeholder="请输入用户名" />
 * <Input type="password" />
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, ...props }, ref) => {
        return (
            <input
                ref={ref}
                className={cn(
                    'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text',
                    'placeholder:text-text-tertiary',
                    'focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    className
                )}
                {...props}
            />
        );
    }
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * 通用多行文本框组件
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                ref={ref}
                className={cn(
                    'flex min-h-[80px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text',
                    'placeholder:text-text-tertiary',
                    'focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    className
                )}
                {...props}
            />
        );
    }
);

Textarea.displayName = 'Textarea';
