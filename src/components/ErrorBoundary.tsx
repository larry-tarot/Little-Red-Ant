import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界组件
 *
 * 捕获子组件渲染错误，展示友好错误页并支持重新加载。
 * 所有样式基于 design tokens，与主题保持一致。
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-surface-elevated flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-lg border border-border p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-danger-subtle rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-danger" size={32} />
            </div>
            <h2 className="text-xl font-bold text-text mb-2">出错了 (Something went wrong)</h2>
            <p className="text-text-secondary mb-6 text-sm">
              抱歉，系统遇到了一些问题。我们已经记录了此错误。
              <br />
              <span className="font-mono text-xs bg-surface-muted px-2 py-1 rounded mt-2 inline-block">
                {this.state.error?.message}
              </span>
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-text rounded-lg hover:bg-primary-hover transition-colors w-full font-medium"
            >
              <RefreshCw size={18} className="mr-2" />
              重新加载页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
