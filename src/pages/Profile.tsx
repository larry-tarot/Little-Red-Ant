/**
 * 文件功能：个人中心
 * 主要功能：当前登录用户查看 / 修改自己的 alias、修改密码
 * 路由：/profile
 */
import React, { useEffect, useState } from 'react';
import axios from '@/lib/axios';
import {
    User as UserIcon, Lock, ShieldCheck, Save, Eye, EyeOff, AlertCircle, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/useAuthStore';

const ROLE_LABEL: Record<string, string> = {
    admin: '管理员',
    editor: '运营人员',
    viewer: '访客'
};

/** 通用输入框组件（样式统一） */
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">{label}</label>
            {children}
            {hint && <p className="text-xs text-text-tertiary mt-1.5">{hint}</p>}
        </div>
    );
}

export default function Profile() {
    const user = useAuthStore((s) => s.user);
    const updateUser = useAuthStore((s) => s.updateUser);

    const [alias, setAlias] = useState(user?.alias || '');
    const [savingProfile, setSavingProfile] = useState(false);
    const [aliasDirty, setAliasDirty] = useState(false);

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [savingPwd, setSavingPwd] = useState(false);

    useEffect(() => {
        const fetchMe = async () => {
            try {
                const res = await axios.get('/api/auth/me');
                if (res.data?.user) {
                    updateUser(res.data.user);
                    if (!aliasDirty) {
                        setAlias(res.data.user.alias || '');
                    }
                }
            } catch {
                // 静默失败，store 里有缓存值
            }
        };
        fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (savingProfile) return;
        if (alias === (user?.alias || '')) {
            toast.success('没有改动');
            return;
        }
        setSavingProfile(true);
        try {
            const res = await axios.put('/api/auth/profile', { alias });
            if (res.data?.user) {
                updateUser({ alias: res.data.user.alias });
                toast.success('资料已保存');
                setAliasDirty(false);
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || '保存失败');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (savingPwd) return;
        if (!oldPassword || !newPassword || !confirmPassword) {
            toast.error('请完整填写所有密码字段');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('新密码至少 6 位');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('两次输入的新密码不一致');
            return;
        }
        if (newPassword === oldPassword) {
            toast.error('新密码不能与原密码相同');
            return;
        }
        setSavingPwd(true);
        try {
            await axios.post('/api/auth/change-password', { oldPassword, newPassword });
            toast.success('密码已更新，请使用新密码重新登录');
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            toast.error(error.response?.data?.error || '修改失败');
        } finally {
            setSavingPwd(false);
        }
    };

    if (!user) {
        return (
            <div className="min-h-[50vh] flex items-center justify-center text-text-tertiary">未登录</div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-text flex items-center">
                    <UserIcon className="mr-2 text-primary" />
                    个人中心
                </h1>
                <p className="text-text-secondary text-sm mt-1">查看当前账户信息、修改昵称或密码</p>
            </header>

            {/* 基本信息卡片 */}
            <section className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="px-6 py-5 border-b border-border bg-surface-elevated">
                    <h2 className="text-base font-semibold text-text flex items-center">
                        <UserIcon size={18} className="mr-2 text-primary" />
                        基本信息
                    </h2>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary-hover text-primary-text flex items-center justify-center text-2xl font-bold shadow-sm">
                            {(user.alias || user.username)[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-lg font-medium text-text truncate">{user.alias || user.username}</div>
                            <div className="text-sm text-text-secondary">@{user.username}</div>
                        </div>
                        <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full
                            ${user.role === 'admin' ? 'bg-primary-subtle text-primary' :
                              user.role === 'editor' ? 'bg-success-subtle text-success' :
                              'bg-surface-muted text-text-secondary'}`}>
                            {ROLE_LABEL[user.role] || user.role}
                        </span>
                    </div>

                    <form onSubmit={handleSaveProfile} className="space-y-5">
                        <Field label="用户名" hint="用户名不可修改">
                            <input
                                type="text"
                                value={user.username}
                                disabled
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-text-tertiary cursor-not-allowed"
                            />
                        </Field>

                        <Field label="别名 / 昵称">
                            <input
                                type="text"
                                value={alias}
                                onChange={(e) => {
                                    setAlias(e.target.value);
                                    setAliasDirty(true);
                                }}
                                maxLength={64}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                placeholder="例如：运营小王"
                            />
                        </Field>

                        <Field label="权限" hint="权限由管理员在「账号管理」中分配">
                            <div className="flex flex-wrap gap-2">
                                {user.role === 'admin' ? (
                                    <span className="text-xs text-primary bg-primary-subtle px-2.5 py-1 rounded-full border border-primary/10">
                                        拥有所有权限
                                    </span>
                                ) : (
                                    (user.permissions || []).length > 0
                                        ? (user.permissions || []).map(p => (
                                            <span key={p} className="text-xs text-text-secondary bg-surface-muted px-2.5 py-1 rounded-full border border-border">
                                                {p}
                                            </span>
                                        ))
                                        : <span className="text-xs text-text-tertiary">暂未分配细粒度权限</span>
                                )}
                            </div>
                        </Field>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={savingProfile || !aliasDirty}
                                className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-text font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Save size={16} className="mr-1.5" />
                                {savingProfile ? '保存中...' : '保存资料'}
                            </button>
                        </div>
                    </form>
                </div>
            </section>

            {/* 修改密码卡片 */}
            <section className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="px-6 py-5 border-b border-border bg-surface-elevated">
                    <h2 className="text-base font-semibold text-text flex items-center">
                        <Lock size={18} className="mr-2 text-primary" />
                        修改密码
                    </h2>
                </div>

                <div className="p-6 space-y-5">
                    <div className="p-3 rounded-lg bg-warning-subtle border border-warning/20 text-warning text-xs flex items-start gap-2">
                        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                        <span>修改密码后，其他已登录设备的会话将失效，需要重新登录。</span>
                    </div>

                    <form onSubmit={handleChangePassword} className="space-y-5">
                        <Field label="原密码">
                            <div className="relative">
                                <input
                                    type={showOld ? 'text' : 'password'}
                                    value={oldPassword}
                                    onChange={(e) => setOldPassword(e.target.value)}
                                    className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOld(!showOld)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-tertiary hover:text-text transition-colors"
                                    aria-label={showOld ? '隐藏密码' : '显示密码'}
                                >
                                    {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </Field>

                        <Field label="新密码（至少 6 位）">
                            <div className="relative">
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew(!showNew)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-tertiary hover:text-text transition-colors"
                                    aria-label={showNew ? '隐藏密码' : '显示密码'}
                                >
                                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </Field>

                        <Field label="确认新密码">
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                autoComplete="new-password"
                            />
                            {confirmPassword && confirmPassword === newPassword && (
                                <p className="text-xs text-success mt-1.5 flex items-center">
                                    <CheckCircle2 size={12} className="mr-1" /> 两次输入一致
                                </p>
                            )}
                        </Field>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={savingPwd}
                                className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-text font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                            >
                                <ShieldCheck size={16} className="mr-1.5" />
                                {savingPwd ? '提交中...' : '更新密码'}
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        </div>
    );
}
