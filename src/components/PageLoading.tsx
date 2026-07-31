
import { Loader2 } from 'lucide-react';

interface PageLoadingProps {
  message?: string;
}

/**
 * 页面加载占位组件
 *
 * 居中展示加载动画与提示文本，所有颜色基于 design tokens。
 */
export default function PageLoading({ message = '加载中...' }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full bg-surface rounded-lg border border-border p-8">
      <Loader2 className="animate-spin text-primary mb-4" size={32} />
      <p className="text-text-secondary text-sm font-medium animate-pulse">{message}</p>
    </div>
  );
}
