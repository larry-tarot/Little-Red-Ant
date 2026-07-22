/**
 * 底部状态栏 — 显示账号信息、任务状态、通知
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function StatusBar() {
    const [accountName, setAccountName] = useState('未选择');
    const [taskCount, setTaskCount] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);
    const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected'>('disconnected');

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                // 健康检查
                await axios.get('/api/health');
                setBackendStatus('connected');

                // 活跃账号
                const accRes = await axios.get('/api/accounts');
                const active = accRes.data?.find?.((a: any) => a.is_active);
                if (active) setAccountName(active.nickname || active.alias);

                // 活跃任务
                const taskRes = await axios.get('/api/tasks/active');
                if (Array.isArray(taskRes.data)) setTaskCount(taskRes.data.length);

                // 未读通知
                const notifRes = await axios.get('/api/notifications/unread-count');
                if (notifRes.data?.count) setUnreadCount(notifRes.data.count);
            } catch {
                setBackendStatus('disconnected');
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="h-7 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-4 text-xs text-slate-400 flex-shrink-0">
            {/* 左侧: 后端状态 + 账号 */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                        backendStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <span>{backendStatus === 'connected' ? '已连接' : '未连接'}</span>
                </div>
                <span className="text-slate-500">|</span>
                <span>账号: {accountName}</span>
            </div>

            {/* 右侧: 任务 + 通知 */}
            <div className="flex items-center gap-4">
                {taskCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                        <span>⚡</span> 进行中: {taskCount}
                    </span>
                )}
                {unreadCount > 0 && (
                    <span className="flex items-center gap-1 text-blue-400">
                        <span>🔔</span> 未读: {unreadCount}
                    </span>
                )}
                <span className="text-slate-500">v1.0.0</span>
            </div>
        </div>
    );
}