/**
 * 自定义标题栏 — Electron 无边框窗口的标题栏
 * 提供拖拽区域 + 窗口控制按钮
 * Web 环境下返回 null
 */
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { electron, isElectron } from '@/lib/electron-bridge';

interface TitleBarProps {
  title?: string;
}

export default function TitleBar({ title = '小红蚁' }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!isElectron) return;
    electron.app.getVersion().then(v => setVersion(v));
    electron.window.isMaximized().then(setMaximized);
    const handler = () => electron.window.isMaximized().then(setMaximized);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (!isElectron) return null;

  const handleMinimize = () => electron.window.minimize();
  const handleMaximize = () => (maximized ? electron.window.unmaximize() : electron.window.maximize());
  const handleClose = () => electron.window.close();

  return (
    <div
      className="h-9 bg-gradient-to-r from-slate-900 to-slate-800 flex items-center justify-between select-none flex-shrink-0 border-b border-slate-700/50"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 左侧: 应用图标和标题 */}
      <div className="flex items-center gap-2 px-3 text-white text-xs">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[10px]">
          🐜
        </div>
        <span className="font-medium text-slate-100">{title}</span>
        <span className="text-slate-500 text-[10px]">v{version}</span>
      </div>

      {/* 中:留白(可拖动) */}
      <div className="flex-1" />

      {/* 右侧: 窗口控制按钮 */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="w-11 h-9 flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
          title="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-9 flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
          title={maximized ? '还原' : '最大化'}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-9 flex items-center justify-center text-slate-300 hover:bg-red-500 hover:text-white transition-colors"
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
