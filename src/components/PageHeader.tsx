import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  icon?: LucideIcon;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * 页面头部组件
 *
 * 统一展示页面标题、图标、描述和右上角操作区。
 * 所有颜色基于 design tokens。
 */
export default function PageHeader({ title, icon: Icon, description, action, children }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center">
            {Icon && <Icon className="mr-3 text-primary" size={28} />}
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-text-secondary">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex-shrink-0">
            {action}
          </div>
        )}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
