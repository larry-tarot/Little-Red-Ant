/**
 * AI 助手侧边栏 — 320px 可折叠面板
 * 提供 AI 对话 + 实时数据摘要
 */
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function AIPanel() {
    const [collapsed, setCollapsed] = useState(true);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: '你好!我是你的小红书运营助手,有什么可以帮你的?' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            // 调用 AI 生成回复
            const res = await axios.post('/api/generate/content', {
                topic: userMsg,
                contentType: 'note',
            });
            const taskId = res.data.taskId;

            // 轮询任务结果
            const poll = setInterval(async () => {
                try {
                    const taskRes = await axios.get(`/api/tasks/${taskId}`);
                    if (taskRes.data.status === 'COMPLETED') {
                        clearInterval(poll);
                        const result = taskRes.data.result;
                        const content = result?.options?.[0]?.content || result?.title || '已生成完成';
                        setMessages(prev => [...prev, { role: 'assistant', content }]);
                        setLoading(false);
                    } else if (taskRes.data.status === 'FAILED') {
                        clearInterval(poll);
                        setMessages(prev => [...prev, { role: 'assistant', content: '抱歉,生成失败了,请重试。' }]);
                        setLoading(false);
                    }
                } catch { /* ignore */ }
            }, 2000);

            // 30 秒超时
            setTimeout(() => {
                clearInterval(poll);
                setLoading(false);
            }, 30000);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: '抱歉,我现在无法处理这个请求,请稍后再试。' }]);
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (collapsed) {
        return (
            <button
                onClick={() => setCollapsed(false)}
                className="w-10 h-10 bg-indigo-600 text-white rounded-l-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors self-center"
                title="打开 AI 助手"
            >
                <span className="text-lg">🤖</span>
            </button>
        );
    }

    return (
        <div className="w-80 bg-slate-800/50 border-l border-slate-700 flex flex-col flex-shrink-0">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🤖</span>
                    <span className="text-sm font-medium text-slate-200">AI 助手</span>
                </div>
                <button
                    onClick={() => setCollapsed(true)}
                    className="text-slate-400 hover:text-white transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                            msg.role === 'user'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-700 text-slate-200'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400">
                            <span className="animate-pulse">思考中...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* 输入框 */}
            <div className="p-4 border-t border-slate-700">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入指令..."
                        className="flex-1 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-400"
                        disabled={loading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
}