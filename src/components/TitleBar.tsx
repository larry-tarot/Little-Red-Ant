/**
 * 自定义标题栏 — Electron 无边框窗口的标题栏
 * 提供拖拽区域 + 窗口控制按钮
 */
import React from 'react';

interface TitleBarProps {
    title?: string;
}

export default function TitleBar({ title = '小红蚁' }: TitleBarProps) {
    const handleMinimize = () => (window as any).electronAPI?.minimize();
    const handleMaximize = () => (window as any).electronAPI?.maximize();
    const handleClose = () => (window as any).electronAPI?.close();

    return (
        <div className="flex items-center justify-between h-10 bg-slate-900 select-none drag-region px-4">
            {/* 左侧: 应用图标和标题 */}
            <div className="flex items-center gap-2">
                <span className="text-lg">🐜</span>
                <span className="text-sm font-medium text-slate-200">{title}</span>
            </div>

            {/* 右侧: 窗口控制按钮 */}
            <div className="flex items-center no-drag">
                <button
                    onClick={handleMinimize}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button
                    onClick={handleMaximize}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
                    </svg>
                </button>
                <button
                    onClick={handleClose}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500 transition-colors"
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