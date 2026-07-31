/**
 * 文件功能：账号管理（管理员）
 * 主要功能：列表 / 创建 / 编辑 / 删除 / 重置密码 / 启用-停用
 * 路由：/users（需 admin 角色）
 */
import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import {
    Users, Shield, Plus, Edit3, Trash2, X, Check, AlertCircle,
    KeyRound, Power, PowerOff, Eye, EyeOff, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import Modal from '../components/Modal';
import { Button } from '@/components/ui/Button';

interface AdminUser {
    id: number;
    username: string;
    alias: string | null;
    role: 'admin' | 'editor' | 'viewer';
    permissions: string[];
    is_active: number;
    created_at: string;
    updated_at: string | null;
    password_changed_at: string | null;
}

const AVAILABLE_PERMISSIONS = [
    { key: 'manage_users', label: '用户管理' },
    { key: 'system_settings', label: '系统设置' },
    { key: 'publish_content', label: '发布内容' },
    { key: 'view_analytics', label: '查看数据' },
    { key: 'manage_accounts', label: '账号矩阵' },
];

const ROLE_LABEL: Record<AdminUser['role'], string> = {
    admin: '管理员',
    editor: '运营人员',
    viewer: '访客'
};

/** 状态徽章 */
function StatusBadge({ active }: { active: boolean }) {
    return (
        <span className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full
            ${active ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
            {active ? '启用' : '已停用'}
        </span>
    );
}

function RoleBadge({ role }: { role: AdminUser['role'] }) {
    const map = {
        admin: 'bg-primary-subtle text-primary',
        editor: 'bg-success-subtle text-success',
        viewer: 'bg-surface-muted text-text-secondary',
    };
    return (
        <span className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full ${map[role]}`}>
            {ROLE_LABEL[role]}
        </span>
    );
}

export default function UserManagement() {
    const { user: currentUser } = useAuthStore();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState('');

    const [isCreating, setIsCreating] = useState(false);
    const [createForm, setCreateForm] = useState({
        username: '',
        password: '',
        alias: '',
        role: 'editor' as AdminUser['role']
    });

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<{
        alias: string;
        role: AdminUser['role'];
        permissions: string[];
    }>({ alias: '', role: 'editor', permissions: [] });

    const [resetPwdId, setResetPwdId] = useState<number | null>(null);
    const [resetPwdValue, setResetPwdValue] = useState('');
    const [showResetPwd, setShowResetPwd] = useState(false);

    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/users');
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (_error) {
            toast.error('获取用户列表失败');
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(keyword.toLowerCase()) ||
        (u.alias || '').toLowerCase().includes(keyword.toLowerCase())
    );

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (createForm.password.length < 6) {
            toast.error('初始密码至少 6 位');
            return;
        }
        try {
            await axios.post('/api/users', createForm);
            toast.success('用户创建成功');
            setIsCreating(false);
            setCreateForm({ username: '', password: '', alias: '', role: 'editor' });
            fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.error || '创建失败');
        }
    };

    const startEdit = (u: AdminUser) => {
        setEditingId(u.id);
        setEditForm({
            alias: u.alias || u.username,
            role: u.role,
            permissions: Array.isArray(u.permissions) ? u.permissions : []
        });
    };

    const handleUpdate = async (id: number) => {
        try {
            await axios.put(`/api/users/${id}`, editForm);
            toast.success('更新成功');
            setEditingId(null);
            fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.error || '更新失败');
        }
    };

    const handleResetPassword = async () => {
        if (!resetPwdId) return;
        if (resetPwdValue.length < 6) {
            toast.error('新密码至少 6 位');
            return;
        }
        try {
            await axios.post(`/api/users/${resetPwdId}/reset-password`, { newPassword: resetPwdValue });
            toast.success('密码已重置，请通知用户重新登录');
            setResetPwdId(null);
            setResetPwdValue('');
        } catch (error: any) {
            toast.error(error.response?.data?.error || '重置失败');
        }
    };

    const handleToggleActive = async (u: AdminUser) => {
        const next = u.is_active === 1 ? false : true;
        try {
            await axios.patch(`/api/users/${u.id}/status`, { isActive: next });
            toast.success(next ? '已启用' : '已停用');
            fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.error || '操作失败');
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await axios.delete(`/api/users/${deleteId}`);
            toast.success('用户已删除');
            setIsDeleteModalOpen(false);
            setDeleteId(null);
            fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.error || '删除失败');
        }
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center p-8 bg-surface rounded-xl shadow-sm border border-border max-w-md">
                    <Shield size={48} className="mx-auto text-text-tertiary mb-4" />
                    <h2 className="text-xl font-bold text-text mb-2">访问受限</h2>
                    <p className="text-text-secondary">您没有权限访问此页面，请联系管理员。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-elevated p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-text flex items-center">
                            <Users className="mr-2 text-primary" />
                            账号管理
                        </h1>
                        <p className="text-text-secondary text-sm mt-1">管理团队成员、角色分配及系统访问权限</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                            <input
                                type="text"
                                value={keyword}
                                onChange={e => setKeyword(e.target.value)}
                                placeholder="搜索用户名或别名"
                                className="pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            />
                        </div>
                        <Button onClick={() => setIsCreating(true)}>
                            <Plus size={18} className="mr-1" /> 添加成员
                        </Button>
                    </div>
                </div>

                {/* 用户列表 */}
                <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-surface-elevated">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">用户</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">角色 / 权限</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">状态</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">加入时间</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody className="bg-surface divide-y divide-border">
                                {loading && (
                                    <tr><td colSpan={5} className="text-center text-text-tertiary py-10">加载中...</td></tr>
                                )}
                                {!loading && filteredUsers.length === 0 && (
                                    <tr><td colSpan={5} className="text-center text-text-tertiary py-10">暂无用户</td></tr>
                                )}
                                {filteredUsers.map(u => (
                                    <tr key={u.id} className="hover:bg-surface-muted/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {editingId === u.id ? (
                                                <div className="space-y-2">
                                                    <input
                                                        value={editForm.alias}
                                                        onChange={e => setEditForm({ ...editForm, alias: e.target.value })}
                                                        className="block w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-surface text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                                        placeholder="别名"
                                                        maxLength={64}
                                                    />
                                                    <div className="text-xs text-text-tertiary">@{u.username}</div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-primary-subtle text-primary flex items-center justify-center font-bold">
                                                        {(u.alias || u.username)[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-text">{u.alias || u.username}</div>
                                                        <div className="text-xs text-text-secondary">@{u.username}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {editingId === u.id ? (
                                                <div className="space-y-3 min-w-[180px]">
                                                    <select
                                                        value={editForm.role}
                                                        onChange={e => setEditForm({ ...editForm, role: e.target.value as AdminUser['role'] })}
                                                        className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-surface text-text w-full focus:outline-none focus:border-primary"
                                                    >
                                                        <option value="admin">管理员</option>
                                                        <option value="editor">运营</option>
                                                        <option value="viewer">访客</option>
                                                    </select>
                                                    {editForm.role !== 'admin' && (
                                                        <div className="text-xs space-y-1.5 bg-surface-muted p-3 rounded-lg border border-border">
                                                            <p className="font-medium text-text-secondary mb-1">细粒度权限</p>
                                                            {AVAILABLE_PERMISSIONS.map(p => (
                                                                <label key={p.key} className="flex items-center space-x-2 cursor-pointer text-text-secondary">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editForm.permissions.includes(p.key)}
                                                                        onChange={e => {
                                                                            if (e.target.checked) {
                                                                                setEditForm({ ...editForm, permissions: [...editForm.permissions, p.key] });
                                                                            } else {
                                                                                setEditForm({ ...editForm, permissions: editForm.permissions.filter(k => k !== p.key) });
                                                                            }
                                                                        }}
                                                                        className="rounded border-border text-primary h-3.5 w-3.5"
                                                                    />
                                                                    <span>{p.label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    <RoleBadge role={u.role} />
                                                    {u.role !== 'admin' && u.permissions?.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {u.permissions.map(p => (
                                                                <span key={p} className="text-[10px] text-text-secondary bg-surface-muted px-1.5 py-0.5 rounded border border-border">
                                                                    {AVAILABLE_PERMISSIONS.find(ap => ap.key === p)?.label || p}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <StatusBadge active={u.is_active === 1} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                                            {new Date(u.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            {editingId === u.id ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="primary" size="sm" onClick={() => handleUpdate(u.id)}>
                                                        <Check size={14} className="mr-1" /> 保存
                                                    </Button>
                                                    <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                                                        <X size={14} className="mr-1" /> 取消
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end items-center gap-1">
                                                    <button onClick={() => startEdit(u)} className="p-2 rounded-lg text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors" title="编辑">
                                                        <Edit3 size={15} />
                                                    </button>
                                                    <button onClick={() => { setResetPwdId(u.id); setResetPwdValue(''); }} className="p-2 rounded-lg text-text-secondary hover:text-warning hover:bg-warning-subtle transition-colors" title="重置密码">
                                                        <KeyRound size={15} />
                                                    </button>
                                                    {u.id !== 1 && u.id !== currentUser?.id && (
                                                        <button
                                                            onClick={() => handleToggleActive(u)}
                                                            className={`p-2 rounded-lg transition-colors ${u.is_active === 1 ? 'text-text-secondary hover:text-danger hover:bg-danger-subtle' : 'text-text-secondary hover:text-success hover:bg-success-subtle'}`}
                                                            title={u.is_active === 1 ? '停用' : '启用'}
                                                        >
                                                            {u.is_active === 1 ? <PowerOff size={15} /> : <Power size={15} />}
                                                        </button>
                                                    )}
                                                    {u.id !== 1 && u.id !== currentUser?.id && (
                                                        <button
                                                            onClick={() => { setDeleteId(u.id); setIsDeleteModalOpen(true); }}
                                                            className="p-2 rounded-lg text-text-secondary hover:text-danger hover:bg-danger-subtle transition-colors"
                                                            title="删除"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 角色说明 */}
                <div className="bg-primary-subtle/50 border border-primary/10 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-primary flex items-center mb-3">
                        <Shield size={16} className="mr-2" />
                        权限说明
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-text-secondary">
                        <div className="bg-surface rounded-lg p-3 border border-border">
                            <span className="font-semibold text-text block mb-1">管理员 (Admin)</span>
                            拥有系统最高权限，可管理用户、账号矩阵、系统设置及所有功能。
                        </div>
                        <div className="bg-surface rounded-lg p-3 border border-border">
                            <span className="font-semibold text-text block mb-1">运营人员 (Editor)</span>
                            可进行内容创作、发布、评论互动及查看数据，但不可管理团队成员。
                        </div>
                        <div className="bg-surface rounded-lg p-3 border border-border">
                            <span className="font-semibold text-text block mb-1">访客 (Viewer)</span>
                            仅可查看数据看板、热点趋势及公开信息，不可进行发布或编辑操作。
                        </div>
                    </div>
                </div>
            </div>

            {/* 创建弹窗 */}
            <Modal
                isOpen={isCreating}
                onClose={() => setIsCreating(false)}
                title="添加新成员"
                footer={
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" size="sm" onClick={() => setIsCreating(false)}>取消</Button>
                        <Button variant="primary" size="sm" onClick={handleCreate}>创建</Button>
                    </div>
                }
            >
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1.5">用户名</label>
                        <input
                            type="text" required
                            value={createForm.username}
                            onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            placeholder="用于登录"
                            maxLength={32}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1.5">初始密码</label>
                        <input
                            type="password" required
                            value={createForm.password}
                            onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            placeholder="至少 6 位"
                            minLength={6}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1.5">别名 / 昵称</label>
                        <input
                            type="text"
                            value={createForm.alias}
                            onChange={e => setCreateForm({ ...createForm, alias: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            placeholder="例如：运营小王"
                            maxLength={64}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1.5">角色</label>
                        <select
                            value={createForm.role}
                            onChange={e => setCreateForm({ ...createForm, role: e.target.value as AdminUser['role'] })}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        >
                            <option value="editor">运营 - 内容创作与发布</option>
                            <option value="admin">管理员 - 系统全权</option>
                            <option value="viewer">访客 - 仅查看数据</option>
                        </select>
                    </div>
                </form>
            </Modal>

            {/* 重置密码弹窗 */}
            <Modal
                isOpen={resetPwdId !== null}
                onClose={() => setResetPwdId(null)}
                title="重置用户密码"
                footer={
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" size="sm" onClick={() => setResetPwdId(null)}>取消</Button>
                        <Button variant="primary" size="sm" onClick={handleResetPassword}>重置</Button>
                    </div>
                }
            >
                <div className="space-y-3">
                    <p className="text-text-secondary text-sm">将为该用户设置新的登录密码（至少 6 位）。建议重置后通知用户立即登录并修改密码。</p>
                    <div className="relative">
                        <input
                            type={showResetPwd ? 'text' : 'password'}
                            value={resetPwdValue}
                            onChange={e => setResetPwdValue(e.target.value)}
                            className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-surface text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            placeholder="新密码（至少 6 位）"
                            minLength={6}
                        />
                        <button
                            type="button"
                            onClick={() => setShowResetPwd(!showResetPwd)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-tertiary hover:text-text transition-colors"
                            aria-label={showResetPwd ? '隐藏密码' : '显示密码'}
                        >
                            {showResetPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* 删除确认弹窗 */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="确认删除用户"
                footer={
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" size="sm" onClick={() => setIsDeleteModalOpen(false)}>取消</Button>
                        <Button variant="danger" size="sm" onClick={handleDelete}>确认删除</Button>
                    </div>
                }
            >
                <div className="flex items-start gap-3 p-1">
                    <AlertCircle className="text-danger flex-shrink-0" size={24} />
                    <div>
                        <p className="text-text font-medium mb-1">您确定要删除该用户吗？</p>
                        <p className="text-text-secondary text-sm">此操作不可恢复。该用户将无法再登录系统。</p>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
