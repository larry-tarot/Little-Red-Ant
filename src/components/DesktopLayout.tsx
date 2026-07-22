/**
 * 桌面版布局 — 三栏布局
 * 标题栏 + 导航栏 + 主内容区 + AI 面板 + 状态栏
 */
import React from 'react';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import AIPanel from './AIPanel';
import StatusBar from './StatusBar';

interface DesktopLayoutProps {
    children: React.ReactNode;
}

export default function DesktopLayout({ children }: DesktopLayoutProps) {
    return (
        <div className="h-screen flex flex-col bg-slate-900 text-slate-200">
            {/* 标题栏 — Electron 无边框窗口拖拽区域 */}
            <TitleBar />

            <div className="flex-1 flex overflow-hidden">
                {/* 左侧导航栏 — 60px */}
                <Sidebar />

                {/* 主内容区 — 自适应 */}
                <main className="flex-1 overflow-auto bg-slate-50">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>

                {/* AI 助手面板 — 320px, 可折叠 */}
                <AIPanel />
            </div>

            {/* 底部状态栏 */}
            <StatusBar />
        </div>
    );
}