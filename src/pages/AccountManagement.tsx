
import React, { useState, useEffect, useRef } from 'react';
import axios from '@/lib/axios';
import { Users, Plus, UserCheck, Loader2, AlertCircle, Edit3, Check, Link as LinkIcon, X, Save, RefreshCw, BookOpen, Target, ShieldAlert, Sparkles, Code2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { useSafeAsync } from '../hooks/useSafeAsync';
import PageHeader from '../components/PageHeader';
import PageLoading from '../components/PageLoading';
import EmptyState from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

interface Account {
    id: number;
    nickname: string;
    alias?: string;
    avatar: string;
    is_active: boolean;
    last_used_at: string;
    created_at: string;
    has_creator_cookie: boolean;
    has_main_cookie: boolean;
    status: 'ACTIVE' | 'EXPIRED' | 'UNKNOWN';
    persona?: {
        niche: string;
        desc: string;
        tone: string;
        sample: string;
        image_url?: string;
    };
}

/**
 * 账号矩阵管理页面
 *
 * 功能：展示已绑定小红书账号、切换活跃账号、绑定浏览/发布权限、
 *       编辑别名、配置账号人设、删除账号。
 */
export default function AccountManagement() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);

    // 别名编辑状态
    const [editingAliasId, setEditingAliasId] = useState<number | null>(null);
    const [aliasValue, setAliasValue] = useState('');

    // 扫码登录状态
    const [scanning, setScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState<string | null>(null);
    const [scanType, setScanType] = useState<'ADD' | 'BIND_CREATOR' | 'BIND_MAIN' | null>(null);
    const [_scanAccountId, setScanAccountId] = useState<number | null>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [refreshingQr, setRefreshingQr] = useState(false);

    const { isMounted, abortControllerRef } = useSafeAsync();
    const pollInterval = useRef<NodeJS.Timeout | null>(null);

    // 删除确认状态
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // 人设与账号经营档案弹窗状态
    const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
    const [editingPersonaAccount, setEditingPersonaAccount] = useState<Account | null>(null);
    const [personaTab, setPersonaTab] = useState<'profile' | 'prompt'>('profile');
    const [promptContextPreview, setPromptContextPreview] = useState('');
    const [businessProfile, setBusinessProfile] = useState<{
        goals: string[];
        targetAudience: {
            identity: string;
            painPoints: string[];
            misconceptions: string[];
        };
        uniqueCapabilities: string[];
        contentPillars: { name: string; description: string; targetRatio?: number }[];
        expressionBoundaries: string[];
        toneStyle: string;
    }>({
        goals: [],
        targetAudience: { identity: '', painPoints: [], misconceptions: [] },
        uniqueCapabilities: [],
        contentPillars: [],
        expressionBoundaries: [],
        toneStyle: ''
    });
    const [personaForm, setPersonaForm] = useState({
        niche: '',
        desc: '',
        tone: '',
        sample: '',
        image_url: ''
    });
    const personaImageInputRef = useRef<HTMLInputElement>(null);

    // 模板状态
    const [templates, setTemplates] = useState<any[]>([]);
    const [showTemplateSelect, setShowTemplateSelect] = useState(false);

    useEffect(() => {
        fetchAccounts();
        axios.get('/api/user/list').then(res => setTemplates(res.data)).catch(() => {});
        return () => {
            stopPolling();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopPolling = () => {
        if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
        }
    };

    const fetchAccounts = async () => {
        try {
            const res = await axios.get('/api/accounts');
            if (isMounted.current) {
                setAccounts(res.data);
            }
        } catch (_error) {
            if (isMounted.current) {
                toast.error('获取账号列表失败');
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    };

    const handleUpdateAlias = async (id: number) => {
        try {
            await axios.put(`/api/accounts/${id}/alias`, { alias: aliasValue });
            if (isMounted.current) {
                setAccounts(accounts.map(acc => acc.id === id ? { ...acc, alias: aliasValue } : acc));
                setEditingAliasId(null);
                toast.success('别名已更新');
            }
        } catch (_e) {
            if (isMounted.current) toast.error('更新失败');
        }
    };

    const handleCheckHealth = async () => {
        setCheckingHealth(true);
        try {
            const res = await axios.post('/api/accounts/check-health');
            const { taskId } = res.data;

            if (taskId) {
                if (isMounted.current) {
                    toast.success('全量体检任务已提交，请留意右下角任务监控');
                    setCheckingHealth(false);
                }
            } else {
                if (isMounted.current) {
                    toast.success('健康检查已启动');
                    setCheckingHealth(false);
                }
            }
        } catch (_e) {
            if (isMounted.current) {
                setCheckingHealth(false);
                toast.error('启动检查失败');
            }
        }
    };

    /**
     * 根据扫码类型返回用户友好的提示文案
     */
    const getLoginPrompt = (type: 'ADD' | 'BIND_CREATOR' | 'BIND_MAIN' | null) => {
        switch (type) {
            case 'BIND_MAIN':
                return '请在新打开的浏览器窗口中，使用小红书 APP 扫码登录主站（用于浏览/竞品分析）';
            case 'BIND_CREATOR':
                return '请在新打开的浏览器窗口中，使用小红书 APP 扫码登录创作服务平台（用于发布/数据同步）';
            case 'ADD':
            default:
                return '请在新打开的浏览器窗口中，使用小红书 APP 扫码登录';
        }
    };

    const startLoginProcess = async (type: 'ADD' | 'BIND_CREATOR' | 'BIND_MAIN', accountId?: number) => {
        if (scanning) return;

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        setScanning(true);
        setScanType(type);
        setScanAccountId(accountId || null);
        const prompt = getLoginPrompt(type);
        setScanStatus(prompt);
        setQrCodeUrl(null);
        const toastId = toast.loading(prompt, { id: 'scan-toast' });

        // 登录耗时很长（扫码 + 浏览器轮询），后端改为后台执行，前端立即开始轮询 /status
        const loginUrl = type === 'BIND_MAIN' ? '/api/accounts/login-main' : '/api/accounts/login';
        axios.post(loginUrl, { accountId }, { signal: abortControllerRef.current.signal }).catch((error: any) => {
            if (axios.isCancel(error)) return;

            if (isMounted.current) {
                stopPolling();
                setScanning(false);
                const message = error.response?.data?.error || error.message;
                setScanStatus(`启动失败: ${message}`);
                toast.error(`启动失败: ${message}`, { id: toastId });
                setTimeout(() => {
                    if (isMounted.current) {
                        setScanStatus(null);
                        setScanType(null);
                        setScanAccountId(null);
                        setQrCodeUrl(null);
                    }
                }, 3000);
            }
        });

        let attempts = 0;
        stopPolling();

        pollInterval.current = setInterval(async () => {
            if (!isMounted.current) {
                stopPolling();
                return;
            }

            attempts++;
            try {
                const res = await axios.get('/api/accounts/status');
                const { loginState: state, qrCodeUrl: returnedQr } = res.data;

                if (returnedQr && isMounted.current) {
                    setQrCodeUrl(returnedQr);
                }

                if (state === 'SUCCESS') {
                    stopPolling();
                    if (isMounted.current) {
                        setScanning(false);
                        setScanStatus(null);
                        setScanType(null);
                        setScanAccountId(null);
                        setQrCodeUrl(null);
                        fetchAccounts();
                        toast.success('登录成功！', { id: toastId });
                    }
                } else if (state === 'FAILED' || attempts > 150) {
                    stopPolling();
                    if (isMounted.current) {
                        setScanning(false);
                        setScanStatus('登录超时或失败');
                        setQrCodeUrl(null);
                        const message = state === 'FAILED' && res.data.message
                            ? res.data.message
                            : '登录超时或失败';
                        toast.error(message, { id: toastId });
                        setTimeout(() => {
                            if (isMounted.current) {
                                setScanStatus(null);
                                setScanType(null);
                                setScanAccountId(null);
                            }
                        }, 3000);
                    }
                }
            } catch (_e) { /* ignore */ }
        }, 2000);
    };

    /**
     * 刷新当前扫码登录的二维码
     */
    const handleRefreshQr = async () => {
        if (refreshingQr || !scanning) return;
        setRefreshingQr(true);
        try {
            const res = await axios.post('/api/accounts/refresh-qr');
            if (isMounted.current) {
                if (res.data.success && res.data.qrCodeUrl) {
                    setQrCodeUrl(res.data.qrCodeUrl);
                    toast.success('二维码已刷新');
                } else {
                    toast.error(res.data.message || '刷新失败');
                }
            }
        } catch (error: any) {
            if (isMounted.current) {
                const message = error.response?.data?.message || '刷新二维码失败';
                toast.error(message);
            }
        } finally {
            if (isMounted.current) {
                setRefreshingQr(false);
            }
        }
    };

    /**
     * 取消当前扫码登录流程
     */
    const cancelLoginProcess = () => {
        stopPolling();
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setScanning(false);
        setScanStatus(null);
        setScanType(null);
        setScanAccountId(null);
        setQrCodeUrl(null);
        toast.dismiss('scan-toast');
        toast('已取消登录');
    };

    const handleAddAccount = () => startLoginProcess('ADD');
    const handleCreatorLogin = (id: number) => startLoginProcess('BIND_CREATOR', id);
    const handleMainSiteLogin = (id: number) => startLoginProcess('BIND_MAIN', id);

    const handleSwitchAccount = async (id: number) => {
        try {
            await axios.post(`/api/accounts/${id}/active`);
            setAccounts(accounts.map(acc => ({
                ...acc,
                is_active: acc.id === id
            })));
            toast.success('账号切换成功');
        } catch (_error) {
            toast.error('切换失败');
        }
    };

    const confirmDelete = (id: number) => {
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const handleDeleteAccount = async () => {
        if (!deleteId) return;
        try {
            await axios.delete(`/api/accounts/${deleteId}`);
            setAccounts(accounts.filter(a => a.id !== deleteId));
            setIsDeleteModalOpen(false);
            setDeleteId(null);
            toast.success('账号已删除');
        } catch (_error) {
            toast.error('删除失败');
        }
    };

    const handleOpenPersonaModal = async (account: Account) => {
        setEditingPersonaAccount(account);
        setPersonaTab('profile');
        setPersonaForm({
            niche: account.persona?.niche || '',
            desc: account.persona?.desc || '',
            tone: account.persona?.tone || '',
            sample: account.persona?.sample || '',
            image_url: account.persona?.image_url || ''
        });

        try {
            const [profileRes, promptRes] = await Promise.all([
                axios.get(`/api/accounts/${account.id}/business-profile`),
                axios.get(`/api/accounts/${account.id}/prompt-context`)
            ]);

            const p = profileRes.data;
            setBusinessProfile({
                goals: p.goals || [],
                targetAudience: p.targetAudience || { identity: '', painPoints: [], misconceptions: [] },
                uniqueCapabilities: p.uniqueCapabilities || [],
                contentPillars: p.contentPillars || [],
                expressionBoundaries: p.expressionBoundaries || [],
                toneStyle: p.toneStyle || account.persona?.tone || ''
            });
            setPromptContextPreview(promptRes.data?.promptContext || '');
        } catch (_e) {
            console.warn('获取账号经营档案失败，初始化为默认结构');
        }

        setIsPersonaModalOpen(true);
    };

    const handleSavePersona = async () => {
        if (!editingPersonaAccount) return;
        try {
            // 同步更新 P1.1 账号经营档案与原基础人设字段
            await Promise.all([
                axios.put(`/api/accounts/${editingPersonaAccount.id}/business-profile`, businessProfile),
                axios.put(`/api/accounts/${editingPersonaAccount.id}/persona`, {
                    niche: businessProfile.contentPillars[0]?.name || personaForm.niche,
                    persona_desc: businessProfile.targetAudience.identity || personaForm.desc,
                    tone: businessProfile.toneStyle || personaForm.tone,
                    writing_sample: personaForm.sample,
                    persona_image_url: personaForm.image_url
                })
            ]);

            // 重新获取最新导出的 prompt context
            const promptRes = await axios.get(`/api/accounts/${editingPersonaAccount.id}/prompt-context`);
            setPromptContextPreview(promptRes.data?.promptContext || '');

            toast.success('账号经营档案与人设配置已保存');
            setIsPersonaModalOpen(false);
            fetchAccounts();
        } catch (_e) {
            toast.error('保存失败');
        }
    };

    const handlePersonaImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const toastId = toast.loading('正在上传定妆照...');
            const res = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error('Upload failed');

            const data = await res.json();
            setPersonaForm(prev => ({ ...prev, image_url: data.url }));
            toast.success('定妆照上传成功', { id: toastId });
        } catch (_error) {
            toast.error('上传失败');
        } finally {
            if (personaImageInputRef.current) personaImageInputRef.current.value = '';
        }
    };

    const handleApplyTemplate = (templateId: string) => {
        const tmpl = templates.find(t => t.id.toString() === templateId);
        if (tmpl) {
            setPersonaForm({
                niche: tmpl.niche || '',
                desc: `身份标签：${(tmpl.identity_tags || []).join(', ')}`,
                tone: tmpl.style || '',
                sample: (tmpl.writing_samples || [])[0] || '',
                image_url: ''
            });
            toast.success('已应用模板内容');
            setShowTemplateSelect(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-elevated p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <PageHeader
                    title="账号矩阵"
                    icon={Users}
                    action={
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={handleCheckHealth}
                                disabled={checkingHealth || scanning}
                            >
                                {checkingHealth ? <Loader2 className="animate-spin mr-2" size={16} /> : <UserCheck className="mr-2" size={16} />}
                                全量体检
                            </Button>
                            <Button
                                onClick={handleAddAccount}
                                disabled={scanning}
                                loading={scanning && scanType === 'ADD'}
                            >
                                {!(scanning && scanType === 'ADD') && <Plus className="mr-2" size={16} />}
                                {scanning && scanType === 'ADD' ? scanStatus : '添加新账号'}
                            </Button>
                        </div>
                    }
                />

                {/* 扫码登录状态提示 */}
                {scanning && (
                    <div className="mb-6 p-4 bg-surface rounded-xl border border-primary/20 shadow-sm">
                        <div className="flex flex-col items-center">
                            <p className="text-sm text-text text-center max-w-lg">
                                <Loader2 className="inline animate-spin mr-1 text-primary" size={14} />
                                {scanStatus}
                            </p>
                            {qrCodeUrl && (
                                <>
                                    <p className="text-xs text-text-secondary mt-2 mb-3">
                                        也可直接扫描下方二维码完成登录
                                    </p>
                                    <img
                                        src={qrCodeUrl}
                                        alt="扫码登录"
                                        className="w-48 h-48 object-contain border border-border rounded-lg"
                                    />
                                </>
                            )}
                            <div className="flex items-center gap-4 mt-3">
                                <p className="text-xs text-text-tertiary">二维码有效期约 5 分钟</p>
                                <button
                                    onClick={handleRefreshQr}
                                    disabled={refreshingQr}
                                    className="text-xs text-primary hover:text-primary/80 underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                    {refreshingQr ? (
                                        <Loader2 className="animate-spin" size={12} />
                                    ) : (
                                        <RefreshCw size={12} />
                                    )}
                                    刷新二维码
                                </button>
                                <button
                                    onClick={cancelLoginProcess}
                                    className="text-xs text-danger hover:text-danger/80 underline"
                                >
                                    取消登录
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <PageLoading message="正在加载账号列表..." />
                ) : accounts.length === 0 ? (
                    <EmptyState
                        title="暂无已登录账号"
                        description="点击右上角添加账号，扫码登录即可保存 Cookie"
                        icon={Users}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {accounts.map(account => {
                            const isExpired = account.status === 'EXPIRED';
                            const isActive = account.is_active;

                            return (
                                <div
                                    key={account.id}
                                    className={`
                                        relative p-4 rounded-xl border transition-all duration-200 bg-surface
                                        ${isActive
                                            ? 'border-primary shadow-md ring-1 ring-primary/20'
                                            : isExpired
                                                ? 'border-danger/30 hover:border-danger/50'
                                                : 'border-border hover:border-border-strong hover:shadow-sm'}
                                    `}
                                >
                                    {/* 当前使用徽章 */}
                                    {isActive && (
                                        <Badge className="absolute -top-2 -right-2 shadow-sm" variant="primary">
                                            <UserCheck size={10} className="mr-1" />
                                            当前使用
                                        </Badge>
                                    )}

                                    {/* 头部：头像 + 名称 */}
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`
                                            w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold overflow-hidden
                                            ${isExpired ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary'}
                                        `}>
                                            {account.avatar ? (
                                                <img src={account.avatar} alt="avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                account.nickname[0]
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                {editingAliasId === account.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            className="h-7 py-0.5 px-1.5 text-sm w-24"
                                                            value={aliasValue}
                                                            onChange={e => setAliasValue(e.target.value)}
                                                            autoFocus
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleUpdateAlias(account.id);
                                                                if (e.key === 'Escape') setEditingAliasId(null);
                                                            }}
                                                        />
                                                        <button onClick={() => handleUpdateAlias(account.id)} className="text-success p-0.5 hover:bg-success-subtle rounded transition-colors">
                                                            <Check size={14} />
                                                        </button>
                                                        <button onClick={() => setEditingAliasId(null)} className="text-text-tertiary p-0.5 hover:bg-surface-muted rounded transition-colors">
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <h3 className="font-bold text-text truncate group flex items-center gap-1">
                                                        <span className="truncate">{account.alias || account.nickname}</span>
                                                        <button
                                                            onClick={() => {
                                                                setEditingAliasId(account.id);
                                                                setAliasValue(account.alias || '');
                                                            }}
                                                            className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-primary transition-opacity p-0.5"
                                                        >
                                                            <Edit3 size={12} />
                                                        </button>
                                                    </h3>
                                                )}
                                            </div>
                                            <p className="text-xs text-text-secondary truncate">
                                                {account.alias ? account.nickname : `上次使用: ${new Date(account.last_used_at).toLocaleDateString()}`}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 状态徽章 */}
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {isExpired ? (
                                            <Badge variant="danger">
                                                <AlertCircle size={10} className="mr-1" />
                                                Cookie已失效
                                            </Badge>
                                        ) : (
                                            <>
                                                <Badge variant={account.has_creator_cookie ? 'success' : 'default'}>
                                                    {account.has_creator_cookie ? (
                                                        <><Check size={10} className="mr-1" /> 可发布</>
                                                    ) : '未绑定发布'}
                                                </Badge>
                                                <Badge variant={account.has_main_cookie ? 'success' : 'default'}>
                                                    {account.has_main_cookie ? (
                                                        <><Check size={10} className="mr-1" /> 可浏览</>
                                                    ) : '未绑定浏览'}
                                                </Badge>
                                            </>
                                        )}
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="flex gap-2">
                                        {!isActive && !isExpired && (
                                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleSwitchAccount(account.id)}>
                                                切换使用
                                            </Button>
                                        )}
                                        {!account.has_main_cookie && !isExpired && (
                                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleMainSiteLogin(account.id)}>
                                                绑定浏览
                                            </Button>
                                        )}
                                        {isExpired && (
                                            <Button variant="danger" size="sm" className="flex-1" onClick={() => handleCreatorLogin(account.id)}>
                                                重新登录
                                            </Button>
                                        )}
                                        <Button variant="secondary" size="sm" onClick={() => handleOpenPersonaModal(account)}>
                                            经营档案
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-danger hover:text-danger hover:bg-danger-subtle" onClick={() => confirmDelete(account.id)}>
                                            删除
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 删除确认弹窗 */}
                <Modal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    title="确认删除账号"
                    footer={
                        <div className="flex justify-end gap-3">
                            <Button variant="secondary" size="sm" onClick={() => setIsDeleteModalOpen(false)}>取消</Button>
                            <Button variant="danger" size="sm" onClick={handleDeleteAccount}>确认删除</Button>
                        </div>
                    }
                >
                    <div className="flex items-start p-2">
                        <AlertCircle className="text-danger mr-3 flex-shrink-0" size={24} />
                        <div>
                            <p className="text-text font-medium mb-1">您确定要删除这个账号吗？</p>
                            <p className="text-text-secondary text-sm">
                                删除后，您将无法使用该账号进行一键发布，需要重新扫码登录。
                            </p>
                        </div>
                    </div>
                </Modal>

                {/* 账号经营档案弹窗 (P1.1 核心交付) */}
                <Modal
                    isOpen={isPersonaModalOpen}
                    onClose={() => setIsPersonaModalOpen(false)}
                    title={`账号经营档案 - ${editingPersonaAccount?.alias || editingPersonaAccount?.nickname}`}
                    footer={
                        <div className="flex justify-between w-full">
                            <div className="relative">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowTemplateSelect(!showTemplateSelect)}
                                >
                                    <Users size={16} className="mr-1" />
                                    从模板库导入
                                </Button>
                                {showTemplateSelect && (
                                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-surface border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                                        {templates.length > 0 ? (
                                            templates.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => handleApplyTemplate(t.id.toString())}
                                                    className="block w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-surface-muted transition-colors"
                                                >
                                                    {t.name || t.niche}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-4 py-2 text-xs text-text-tertiary">暂无模板</div>
                                        )}
                                        <Link to="/persona" className="block w-full text-left px-4 py-2 text-xs text-primary border-t border-border hover:bg-surface-muted transition-colors">
                                            管理模板库 &rarr;
                                        </Link>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" size="sm" onClick={() => setIsPersonaModalOpen(false)}>取消</Button>
                                <Button size="sm" onClick={handleSavePersona}>
                                    <Save size={16} className="mr-2" />
                                    保存经营档案
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className="space-y-4 p-2 max-h-[75vh] overflow-y-auto">
                        {/* Tab 导航：档案编辑 / 导出提示词上下文预览 */}
                        <div className="flex border-b border-border mb-2">
                            <button
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                                    personaTab === 'profile'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-text-secondary hover:text-text'
                                }`}
                                onClick={() => setPersonaTab('profile')}
                            >
                                <Target size={14} />
                                经营定位与人设
                            </button>
                            <button
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                                    personaTab === 'prompt'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-text-secondary hover:text-text'
                                }`}
                                onClick={async () => {
                                    if (editingPersonaAccount) {
                                        const res = await axios.get(`/api/accounts/${editingPersonaAccount.id}/prompt-context`);
                                        setPromptContextPreview(res.data?.promptContext || '');
                                    }
                                    setPersonaTab('prompt');
                                }}
                            >
                                <Sparkles size={14} />
                                AI 上下文预览
                            </button>
                        </div>

                        {personaTab === 'prompt' ? (
                            <div className="space-y-3">
                                <div className="bg-surface-muted p-3 rounded-lg border border-border">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-text-secondary flex items-center gap-1">
                                            <Code2 size={13} /> 导出的结构化提示词 (供AI创作与审核使用)
                                        </span>
                                        <Badge variant="primary" className="text-[10px]">系统自动注入</Badge>
                                    </div>
                                    <pre className="text-xs font-mono text-text whitespace-pre-wrap leading-relaxed">
                                        {promptContextPreview || '（保存经营档案后自动生成）'}
                                    </pre>
                                </div>
                                <p className="text-xs text-text-tertiary">
                                    此段文字将在生成选题、撰写文案与发布审核时作为高优先级约束注入大模型，无需反复输入账号背景。
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* 1. 经营目标与受众画像 */}
                                <div className="bg-surface-muted/30 p-3 rounded-lg border border-border space-y-3">
                                    <h4 className="text-xs font-bold text-text flex items-center gap-1">
                                        <Target size={13} className="text-primary" /> 1. 经营目标与目标受众
                                    </h4>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1">
                                            核心经营目标 (多个用中文顿号或逗号分隔)
                                        </label>
                                        <Input
                                            value={businessProfile.goals.join('、')}
                                            onChange={e => setBusinessProfile({
                                                ...businessProfile,
                                                goals: e.target.value.split(/[、,，]/).map(s => s.trim()).filter(Boolean)
                                            })}
                                            placeholder="例如：建立技术信任、引流私域咨询、验证付费需求"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1">
                                            目标受众身份 (明确对谁说话)
                                        </label>
                                        <Input
                                            value={businessProfile.targetAudience.identity}
                                            onChange={e => setBusinessProfile({
                                                ...businessProfile,
                                                targetAudience: { ...businessProfile.targetAudience, identity: e.target.value }
                                            })}
                                            placeholder="例如：第一次装修的年轻业主、电赛视觉开发学生"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1">
                                            受众核心痛点 (你帮他们解决什么真实困扰)
                                        </label>
                                        <Input
                                            value={businessProfile.targetAudience.painPoints.join('；')}
                                            onChange={e => setBusinessProfile({
                                                ...businessProfile,
                                                targetAudience: {
                                                    ...businessProfile.targetAudience,
                                                    painPoints: e.target.value.split(/[;；]/).map(s => s.trim()).filter(Boolean)
                                                }
                                            })}
                                            placeholder="例如：报价单总被加钱；算法跑不满帧率；找不到现成开源底座"
                                        />
                                    </div>
                                </div>

                                {/* 2. 账号独特资产与能力 */}
                                <div className="bg-surface-muted/30 p-3 rounded-lg border border-border space-y-3">
                                    <h4 className="text-xs font-bold text-text flex items-center gap-1">
                                        <BookOpen size={13} className="text-primary" /> 2. 你的独特资产与能讲的内容 (区分于泛化AI的根本)
                                    </h4>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1">
                                            真实能力与背书 (经历、设备、已验证的数据或真实案例)
                                        </label>
                                        <textarea
                                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text text-xs h-16 focus:outline-none focus:ring-1 focus:ring-primary"
                                            placeholder="例如：拥有5年工业视觉项目交付经验；亲自踩坑过20款国产芯片；持有多套真实户型硬装清单..."
                                            value={businessProfile.uniqueCapabilities.join('\n')}
                                            onChange={e => setBusinessProfile({
                                                ...businessProfile,
                                                uniqueCapabilities: e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1">
                                            核心内容栏目 (每行一个：栏目名称|栏目定位说明)
                                        </label>
                                        <textarea
                                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text text-xs h-16 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                                            placeholder={"硬件避坑|真实芯片与传感器踩坑经历\n工程实战|高精度调优与代码拆解\n行业锐评|客观评测与技术选型"}
                                            value={businessProfile.contentPillars.map(c => `${c.name}|${c.description}`).join('\n')}
                                            onChange={e => {
                                                const lines = e.target.value.split('\n').filter(Boolean);
                                                const pillars = lines.map(line => {
                                                    const [name, desc] = line.split('|');
                                                    return { name: (name || '').trim(), description: (desc || name || '').trim() };
                                                });
                                                setBusinessProfile({ ...businessProfile, contentPillars: pillars });
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* 3. 表达红线与视觉调性 */}
                                <div className="bg-surface-muted/30 p-3 rounded-lg border border-border space-y-3">
                                    <h4 className="text-xs font-bold text-text flex items-center gap-1">
                                        <ShieldAlert size={13} className="text-warning" /> 3. 表达禁区与红线 (前置风险拦截)
                                    </h4>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1">
                                            禁止承诺或触碰的禁区 (每行一条)
                                        </label>
                                        <textarea
                                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text text-xs h-14 focus:outline-none focus:ring-1 focus:ring-primary"
                                            placeholder={"不宣称100%零封号或诱导封号行为\n不抄袭搬运竞品原句\n涉及未实测内容必须明确声明"}
                                            value={businessProfile.expressionBoundaries.join('\n')}
                                            onChange={e => setBusinessProfile({
                                                ...businessProfile,
                                                expressionBoundaries: e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-secondary mb-1">
                                            语言基调 (Tone)
                                        </label>
                                        <Input
                                            value={businessProfile.toneStyle}
                                            onChange={e => {
                                                setBusinessProfile({ ...businessProfile, toneStyle: e.target.value });
                                                setPersonaForm({ ...personaForm, tone: e.target.value });
                                            }}
                                            placeholder="例如：技术严谨、客观实用、拒绝空洞形容词"
                                        />
                                    </div>
                                </div>

                                {/* 4. 定妆照 (保持向后兼容) */}
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1">视觉定妆照 (Visual Persona)</label>
                                    <div className="flex items-start gap-4">
                                        <div className="w-20 h-20 bg-surface-muted rounded-lg border border-border flex items-center justify-center overflow-hidden relative group">
                                            {personaForm.image_url ? (
                                                <>
                                                    <img src={personaForm.image_url} alt="Persona" className="w-full h-full object-cover" />
                                                    <button
                                                        onClick={() => setPersonaForm(prev => ({ ...prev, image_url: '' }))}
                                                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </>
                                            ) : (
                                                <Users size={28} className="text-text-tertiary" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[11px] text-text-secondary mb-2">
                                                上传该账号的固定人物/产品主体照片。AI 生图时将保持特征连续性。
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => personaImageInputRef.current?.click()}
                                            >
                                                <LinkIcon size={12} className="mr-1" /> 上传定妆照
                                            </Button>
                                            <input
                                                type="file"
                                                ref={personaImageInputRef}
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handlePersonaImageUpload}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </Modal>
            </div>
        </div>
    );
}
