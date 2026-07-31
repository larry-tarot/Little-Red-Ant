import { clsx, ClassValue } from "clsx"

/**
 * 合并多个类名片段
 * @param inputs 类名片段（字符串、数组、对象等）
 * @returns 合并后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
