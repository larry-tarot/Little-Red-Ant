/**
 * AI 助手侧边栏 — 320px 可折叠面板
 * 提供 AI 对话 + 实时数据摘要
 */
import React, { useState, useRef, useEffect } from 'react';
import axios from '@/lib/axios';
import { X, Bot, Send } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * AI 助手侧边栏组件
 *
 * 桌面版右侧可折叠面板，支持 AI 对话和任务生成结果展示。
 * 样式基于 design tokens，与整体主题保持一致。
 */
export default function AIPanel() {
    const [collapsed, setCollapsed] = useState(true);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: '你好!我是你的小红书运营助手，有什么可以帮你的?' },
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
        setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const res = await axios.post('/api/generate/content', {
                topic: userMsg,
                contentType: 'note',
            });
            const taskId = res.data.taskId;

            const poll = setInterval(async () => {
                try {
                    const taskRes = await axios.get(`/api/tasks/${taskId}`);
                    if (taskRes.data.status === 'COMPLETED') {
                        clearInterval(poll);
                        const result = taskRes.data.result;
                        const content = result?.options?.[0]?.content || result?.title || '已生成完成';
                        setMessages((prev) => [...prev, { role: 'assistant', content }]);
                        setLoading(false);
                    } else if (taskRes.data.status === 'FAILED') {
                        clearInterval(poll);
                        setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，生成失败了，请重试。' }]);
                        setLoading(false);
                    }
                } catch { /* ignore */ }
            }, 2000);

            setTimeout(() => {
                clearInterval(poll);
                setLoading(false);
            }, 30000);
        } catch {
            setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，我现在无法处理这个请求，请稍后再试。' }]);
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
                className="w-10 h-10 bg-primary text-primary-text rounded-l-lg flex items-center justify-center shadow-md hover:bg-primary-hover transition-colors self-center"
                title="打开 AI 助手"
            >
                <Bot size={20} />
            </button>
        );
    }

    return (
        <div className="w-80 bg-surface border-l border-border flex flex-col flex-shrink-0">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
                <div className="flex items-center gap-2">
                    <Bot size={18} className="text-primary" />
                    <span className="text-sm font-medium text-text">AI 助手</span>
                </div>
                <button
                    onClick={() => setCollapsed(true)}
                    className="p-1 rounded-md text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors"
                    aria-label="关闭 AI 助手"
                >
                    <X size={18} />
                </button>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                            msg.role === 'user'
                                ? 'bg-primary text-primary-text'
                                : 'bg-surface-muted text-text'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-surface-muted rounded-lg px-3 py-2 text-sm text-text-tertiary">
                            <span className="animate-pulse">思考中...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* 输入框 */}
            <div className="p-4 border-t border-border bg-surface-elevated">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入指令..."
                        className="flex-1 bg-surface text-text rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none placeholder:text-text-tertiary transition-colors"
                        disabled={loading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        className="px-3 py-2 bg-primary text-primary-text rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="发送"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
