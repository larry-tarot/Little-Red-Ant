/**
 * 自定义标题栏 — 桌面版(Tauri / Electron)显示窗口控制按钮
 * Web 环境下:返回 null(让 web 版用自己的默认标题栏)
 *
 * 设计原则:
 *   - Web 优先:在没有桌面外壳时,什么都不显示
 *   - Tauri 优先:用 Tauri 2 官方 API(getCurrentWindow)
 *   - Electron 兼容:同时支持 window.electronAPI(老版本兼容)
 */
import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface TitleBarProps {
    title?: string;
}

// 浏览器环境(无 Tauri 注入)直接返回 null
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

export default function TitleBar({ title = '小红蚁' }: TitleBarProps) {
    if (!isTauri && !isElectron) {
        return null;
    }

    const handleMinimize = async () => {
        if (isTauri) {
            try { await getCurrentWindow().minimize(); } catch (e) { console.error(e); }
        } else if (isElectron) {
            (window as any).electronAPI?.minimize?.();
        }
    };

    const handleMaximize = async () => {
        if (isTauri) {
            try {
                const w = getCurrentWindow();
                if (await w.isMaximized()) {
                    await w.unmaximize();
                } else {
                    await w.maximize();
                }
            } catch (e) { console.error(e); }
        } else if (isElectron) {
            (window as any).electronAPI?.maximize?.();
        }
    };

    const handleClose = async () => {
        if (isTauri) {
            try { await getCurrentWindow().close(); } catch (e) { console.error(e); }
        } else if (isElectron) {
            (window as any).electronAPI?.close?.();
        }
    };

    return (
        <div
            className="flex items-center justify-between h-10 bg-slate-900 select-none px-4"
            data-tauri-drag-region=""
        >
            {/* 左侧: 应用图标和标题 */}
            <div className="flex items-center gap-2">
                <span className="text-lg">🐜</span>
                <span className="text-sm font-medium text-slate-200">{title}</span>
            </div>

            {/* 右侧: 窗口控制按钮 */}
            <div className="flex items-center">
                <button
                    onClick={handleMinimize}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="最小化"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button
                    onClick={handleMaximize}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="最大化/还原"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
                    </svg>
                </button>
                <button
                    onClick={handleClose}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500 transition-colors"
                    title="关闭"
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
