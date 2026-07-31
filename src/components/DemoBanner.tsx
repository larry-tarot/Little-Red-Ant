import axios from '@/lib/axios';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from "react";

// 本地存储键，用于记录用户是否手动关闭过横幅
const DISMISS_KEY = 'demo_banner_dismissed';

/**
 * 读取用户是否手动关闭过横幅
 * @returns boolean 是否已关闭
 */
function isBannerDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
        // 浏览器禁用 localStorage 时按未关闭处理
        return false;
    }
}

/**
 * 持久化横幅关闭状态
 * @param dismissed true 表示用户已手动关闭
 */
function setBannerDismissed(dismissed: boolean): void {
    try {
        localStorage.setItem(DISMISS_KEY, String(dismissed));
    } catch {
        // 忽略写 localStorage 失败（如隐私模式）
    }
}

/**
 * 向后端查询当前是否处于演示模式
 * @returns Promise<boolean> 演示模式状态
 */
async function fetchDemoMode(): Promise<boolean> {
    const res = await axios.get('/api/auth/demo-mode');
    return res.data?.demoMode === true;
}

export default function DemoBanner() {
    const [show, setShow] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // 用户此前关闭过横幅，不再请求后端，减少无意义请求
        if (isBannerDismissed()) {
            return;
        }

        let isMounted = true;

        const checkDemo = async () => {
            try {
                const isDemo = await fetchDemoMode();
                if (isMounted) {
                    setShow(isDemo);
                }
            } catch {
                // API 不可用时保守隐藏，避免空白页或错误引导
                if (isMounted) {
                    setShow(false);
                }
            }
        };

        checkDemo();

        return () => {
            isMounted = false;
        };
    }, []);

    /**
     * 处理关闭横幅：同步更新状态并持久化
     */
    const handleDismiss = useCallback(() => {
        setShow(false);
        setBannerDismissed(true);
    }, []);

    /**
     * 处理跳转设置页：同时标记横幅已关闭
     */
    const handleGoSettings = useCallback(() => {
        setBannerDismissed(true);
        navigate('/settings');
    }, [navigate]);

    if (!show) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-warning-subtle to-warning-subtle/70 border-b border-warning/20 px-4 py-2 shrink-0">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-warning">
                    <Sparkles size={16} className="text-warning flex-shrink-0" />
                    <span>
                        演示模式 — 数据为模拟数据，配置 API Key 后开启完整功能
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={handleGoSettings}
                        className="text-xs px-3 py-1 bg-warning text-primary-text rounded-md hover:bg-warning/90 transition-colors"
                    >
                        去配置
                    </button>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="text-warning/60 hover:text-warning transition-colors p-1"
                        aria-label="关闭提示"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}