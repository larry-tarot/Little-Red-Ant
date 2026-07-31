/**
 * 桌面版后端启动等待门
 *
 * Tauri 2 主进程启动 sidecar + 后端初始化要 2-5 秒，这段时间 webview 已经能
 * 加载但请求会 500/超时。这个组件包在 App.tsx 外层，等后端 ready 才放行。
 *
 * 触发方式：
 *  1. 监听 Tauri 事件 'backend-ready' / 'backend-error' / 'backend-restarting'
 *  2. 兜底：轮询 /api/health，500ms/次，最多 30s
 *
 * Web 端(isTauri=false)直接 children 透传，零副作用。
 */
import React, { useEffect, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '@/lib/tauri';

interface BackendBootGateProps {
  children: React.ReactNode;
  /** 轮询兜底的最大等待时间(ms) */
  timeoutMs?: number;
  /** 轮询间隔(ms) */
  pollIntervalMs?: number;
}

type BootStatus = 'booting' | 'restarting' | 'ready' | 'error';

export default function BackendBootGate({
  children,
  timeoutMs = 30_000,
  pollIntervalMs = 500,
}: BackendBootGateProps) {
  // Web 端直接透传，不需要等
  if (!isTauri) {
    return <>{children}</>;
  }

  // 登录页不依赖后端即可渲染，避免桌面版启动时白屏等待
  const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <BootGateInner timeoutMs={timeoutMs} pollIntervalMs={pollIntervalMs}>
      {children}
    </BootGateInner>
  );
}

function BootGateInner({
  children,
  timeoutMs,
  pollIntervalMs,
}: BackendBootGateProps) {
  const [status, setStatus] = useState<BootStatus>('booting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [restartInfo, setRestartInfo] = useState<{ attempt: number; maxAttempts: number; waitSeconds: number } | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    // eslint-disable-next-line prefer-const -- referenced by cleanup closure before assignment
    let pollTimer: number | undefined;
    // eslint-disable-next-line prefer-const -- referenced by cleanup closure before assignment
    let timeoutTimer: number | undefined;
    let cancelled = false;

    const markReady = () => {
      if (cancelled) return;
      setStatus('ready');
      cleanup();
    };
    const markError = (msg: string) => {
      if (cancelled) return;
      setErrorMsg(msg);
      setStatus('error');
      cleanup();
    };

    const cleanup = () => {
      if (unlisten) unlisten();
      if (pollTimer) window.clearInterval(pollTimer);
      if (timeoutTimer) window.clearTimeout(timeoutTimer);
    };

    // 主路径：监听 Tauri 事件
    listen('backend-ready', () => markReady())
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => {
        console.warn('[BootGate] 监听 backend-ready 失败，降级为轮询:', e);
      });

    listen('backend-error', (event) => {
      markError(String(event.payload || '后端启动失败'));
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          const prev = unlisten;
          unlisten = () => {
            prev?.();
            fn();
          };
        }
      })
      .catch(() => {/* ignore */});

    // 监听后端重启事件
    listen('backend-restarting', (event) => {
      if (cancelled) return;
      const info = event.payload as { attempt?: number; maxAttempts?: number; waitSeconds?: number } | undefined;
      setRestartInfo({
        attempt: info?.attempt || 1,
        maxAttempts: info?.maxAttempts || 3,
        waitSeconds: info?.waitSeconds || 2,
      });
      setStatus('restarting');
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          const prev = unlisten;
          unlisten = () => {
            prev?.();
            fn();
          };
        }
      })
      .catch(() => {/* ignore */});

    // 兜底：轮询 /api/health
    const pollHealth = async () => {
      try {
        const resp = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
        if (resp.ok) {
          markReady();
        }
      } catch {
        // 还没起来，继续轮询
      }
    };
    pollTimer = window.setInterval(pollHealth, pollIntervalMs);
    void pollHealth();

    // 总超时
    timeoutTimer = window.setTimeout(() => {
      markError('后端启动超时(30s)，请检查日志或重启应用');
    }, timeoutMs);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [timeoutMs, pollIntervalMs]);

  if (status === 'ready') {
    return <>{children}</>;
  }

  if (status === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-surface text-text px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-6xl text-warning">⚠️</div>
          <h1 className="text-xl font-semibold">本地服务启动失败</h1>
          <p className="text-sm text-text-secondary break-all">
            {errorMsg || '未知错误'}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-text rounded-lg text-sm transition-colors"
            >
              重新启动应用
            </button>
            <p className="text-xs text-text-tertiary">
              如果问题持续，请检查 %APPDATA%/小红蚁/logs/ 下的日志文件
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'restarting' && restartInfo) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-surface text-text">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin h-12 w-12 border-4 border-warning border-t-transparent rounded-full" />
          <h1 className="text-lg font-medium">正在重启后端服务</h1>
          <p className="text-sm text-text-secondary">
            第 {restartInfo.attempt}/{restartInfo.maxAttempts} 次尝试，请稍候...
          </p>
          <div className="w-48 h-1.5 bg-surface-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-warning rounded-full transition-all duration-500"
              style={{ width: `${(restartInfo.attempt / restartInfo.maxAttempts) * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-surface text-text">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full" />
        <h1 className="text-lg font-medium">小红蚁 桌面版</h1>
        <p className="text-sm text-text-secondary">正在启动本地服务...</p>
        <p className="text-xs text-text-tertiary">首次启动可能需要几秒钟</p>
      </div>
    </div>
  );
}
