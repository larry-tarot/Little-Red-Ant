import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Lock, User, ArrowRight, ShieldCheck, Eye, EyeOff, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

/**
 * 登录 / 注册页面
 *
 * 支持首次初始化创建管理员、登录和注册。
 * 样式基于 design tokens，适配亮色/暗色主题。
 */
export default function Login() {
    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);
    const isAuthenticated = useAuthStore((state) => !!state.token);

    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasUsers, setHasUsers] = useState(true);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
        checkInit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkInit = async () => {
        try {
            const res = await axios.get('/api/auth/init-check');
            setHasUsers(res.data.hasUsers);
            if (!res.data.hasUsers) {
                setIsLogin(false);
            }
        } catch (_e) {
            toast.error('初始化状态检查失败');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            const res = await axios.post(endpoint, { username, password });

            // 登录/注册成功后统一写入 store 并跳转
            login(res.data.token, res.data.user);
            toast.success(isLogin ? '欢迎回来！' : '注册成功，欢迎使用！');
            navigate('/');
        } catch (err: any) {
            const msg = err.response?.data?.error || '操作失败';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface-elevated p-4">
            <div className="max-w-md w-full">
                {/* Logo Card */}
                <div className="bg-surface rounded-2xl shadow-lg border border-border overflow-hidden">
                    {/* Header with Gradient */}
                    <div className="bg-gradient-to-r from-primary to-primary-hover px-8 py-6 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-text/20 backdrop-blur-sm mb-3">
                            <Sparkles className="w-8 h-8 text-primary-text" />
                        </div>
                        <h1 className="text-2xl font-bold text-primary-text">小红蚁</h1>
                        <p className="text-primary-text/80 text-sm mt-1">小红书矩阵运营系统</p>
                    </div>

                    {/* Form Section */}
                    <div className="p-8">
                        {/* Tab Switcher */}
                        <div className="flex bg-surface-muted p-1 rounded-xl mb-6">
                            <button
                                onClick={() => {
                                    setIsLogin(true);
                                    setError('');
                                }}
                                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                                    isLogin
                                        ? 'bg-surface text-primary shadow-sm'
                                        : 'text-text-secondary hover:text-text'
                                }`}
                            >
                                登录
                            </button>
                            <button
                                onClick={() => {
                                    setIsLogin(false);
                                    setError('');
                                }}
                                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                                    !isLogin
                                        ? 'bg-surface text-primary shadow-sm'
                                        : 'text-text-secondary hover:text-text'
                                }`}
                            >
                                {hasUsers ? '注册' : '创建管理员'}
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Username Field */}
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">
                                    用户名
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-text-tertiary" />
                                    </div>
                                    <Input
                                        type="text"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="pl-10"
                                        placeholder="请输入用户名"
                                    />
                                </div>
                            </div>

                            {/* Password Field */}
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">
                                    密码
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-text-tertiary" />
                                    </div>
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-10 pr-10"
                                        placeholder="请输入密码"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-tertiary hover:text-text transition-colors"
                                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-2 text-danger text-sm bg-danger-subtle p-3 rounded-lg border border-danger/10">
                                    <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Submit Button */}
                            <Button
                                type="submit"
                                loading={loading}
                                className="w-full"
                            >
                                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                                {isLogin ? '登 录' : hasUsers ? '注 册' : '创建管理员账号'}
                            </Button>
                        </form>

                        {/* Footer Info */}
                        <div className="mt-6 text-center">
                            <p className="text-xs text-text-secondary">
                                {isLogin ? '还没有账号？' : '已有账号？'}
                                <button
                                    onClick={() => {
                                        setIsLogin(!isLogin);
                                        setError('');
                                    }}
                                    className="text-primary hover:text-primary-hover font-medium ml-1 transition-colors"
                                >
                                    {isLogin ? '立即注册' : '立即登录'}
                                </button>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-text-tertiary mt-6">
                    © 2024 小红蚁 - 小红书矩阵运营系统
                </p>
            </div>
        </div>
    );
}
