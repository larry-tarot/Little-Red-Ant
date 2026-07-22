/**
 * 左侧导航栏 — 60px 图标栏
 * 提供功能模块切换,始终可见
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavItem {
    icon: string;
    label: string;
    path: string;
}

const navItems: NavItem[] = [
    { icon: '🏠', label: '首页', path: '/' },
    { icon: '✏️', label: '创作', path: '/generate' },
    { icon: '🚀', label: '发布', path: '/drafts' },
    { icon: '📊', label: '数据', path: '/analytics' },
    { icon: '👥', label: '账号', path: '/accounts' },
    { icon: '🎯', label: '竞品', path: '/competitor' },
    { icon: '💬', label: '互动', path: '/engagement' },
    { icon: '🔥', label: '热点', path: '/gallery' },
    { icon: '📋', label: '任务', path: '/tasks' },
    { icon: '⚙️', label: '设置', path: '/settings' },
];

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <div className="w-[60px] bg-slate-900 flex flex-col items-center py-2 gap-1 flex-shrink-0">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        title={item.label}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all duration-150 ${
                            isActive
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                    >
                        {item.icon}
                    </button>
                );
            })}
        </div>
    );
}