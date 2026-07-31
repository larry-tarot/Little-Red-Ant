import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../lib/tauri';

interface TitleBarProps {
    title?: string;
}

/**
 * 桌面版自定义标题栏
 *
 * 仅在 Tauri 桌面版渲染，提供窗口最小化、最大化/还原、关闭（隐藏到托盘）控制。
 * Web 端直接返回 null。
 */
export default function TitleBar({ title = '小红蚁' }: TitleBarProps) {
    if (!isTauri) {
        return null;
    }

    const handleMinimize = async () => {
        try { await getCurrentWindow().minimize(); } catch (e) { console.error(e); }
    };

    const handleMaximize = async () => {
        try {
            const w = getCurrentWindow();
            if (await w.isMaximized()) {
                await w.unmaximize();
            } else {
                await w.maximize();
            }
        } catch (e) { console.error(e); }
    };

    const handleClose = async () => {
        // 关闭窗口 → 最小化到托盘（不退出应用）
        try { await getCurrentWindow().hide(); } catch (e) { console.error(e); }
    };

    return (
        <div
            className="flex items-center justify-between h-10 bg-surface text-text select-none px-4 fixed top-0 left-0 right-0 z-50 border-b border-border"
            data-tauri-drag-region=""
        >
            {/* 左侧：应用图标和标题 */}
            <div className="flex items-center gap-2">
                <span className="text-lg">🐜</span>
                <span className="text-sm font-medium text-text">{title}</span>
            </div>

            {/* 右侧：窗口控制按钮 */}
            <div className="flex items-center">
                <button
                    onClick={handleMinimize}
                    className="w-10 h-10 flex items-center justify-center text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors"
                    title="最小化"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button
                    onClick={handleMaximize}
                    className="w-10 h-10 flex items-center justify-center text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors"
                    title="最大化/还原"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
                    </svg>
                </button>
                <button
                    onClick={handleClose}
                    className="w-10 h-10 flex items-center justify-center text-text-tertiary hover:text-primary-text hover:bg-danger transition-colors"
                    title="关闭到托盘"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
