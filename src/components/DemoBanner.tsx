/**
 * Demo 模式横幅 — 当未配置 API Key 时显示
 * 提示用户当前处于演示模式,并引导配置
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DemoBanner() {
    const [show, setShow] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const checkDemo = async () => {
            try {
                const res = await axios.get('/api/auth/demo-mode');
                setShow(res.data?.demoMode === true);
            } catch {
                setShow(true);
            }
        };
        checkDemo();
    }, []);

    if (!show) return null;

    return (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-amber-800">
                    <Sparkles size={16} className="text-amber-500" />
                    <span>演示模式 — 数据为模拟数据,配置 API Key 后开启完整功能</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/settings')}
                        className="text-xs px-3 py-1 bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors"
                    >
                        去配置
                    </button>
                    <button
                        onClick={() => setShow(false)}
                        className="text-amber-400 hover:text-amber-600 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}