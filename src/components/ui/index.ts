/**
 * UI 组件统一出口
 *
 * 通过 barrel export 简化组件导入路径，避免项目中出现多层级 import。
 * 建议业务组件统一从 `@/components/ui` 引入所需组件。
 *
 * 使用示例：
 * ```tsx
 * import { Button, Badge, Card, Input, Skeleton } from '@/components/ui';
 * ```
 */

export { Button, type ButtonProps } from './Button';
export { Badge, type BadgeProps } from './Badge';
export { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';
export { Input, Textarea } from './Input';
export { Skeleton, StatsCardSkeleton, ChartSkeleton, HomePageSkeleton } from './Skeleton';
