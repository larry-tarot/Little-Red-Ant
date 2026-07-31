import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind CSS 类名
 *
 * 先通过 clsx 处理条件类名，再通过 tailwind-merge 解决冲突。
 * 用于组件中允许外部传入 className 并正确覆盖默认样式。
 *
 * @param inputs 任意类名片段
 * @returns 合并后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
