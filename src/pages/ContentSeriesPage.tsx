import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { useAccount } from '@/context/AccountContext';
import { FolderGit2, Plus, BarChart2, Users2, CheckCircle2, AlertCircle, ArrowRight, BookOpen, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ContentSeries {
    id: string;
    accountId: number;
    title: string;
    description?: string;
    targetPillar?: string;
    plannedCount: number;
    completedCount: number;
    progressPercentage: number;
    status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
    createdAt?: string;
}

interface PillarHealth {
    name: string;
    targetRatio: number;
    currentCount: number;
    currentRatio: number;
    status: 'BALANCED' | 'UNDER' | 'OVER';
}

interface PillarBalanceReport {
    accountId: number;
    totalContents: number;
    pillars: PillarHealth[];
    recommendation: string;
}

interface AccountMatrixItem {
    accountId: number;
    nickname: string;
    isActive: boolean;
    opportunitiesCount: number;
    packagesCount: number;
    seriesCount: number;
    publishedNotesCount: number;
}

export default function ContentSeriesPage() {
    const { activeAccount, refreshAccount } = useAccount();
    const accountId = activeAccount?.id;

    const [activeTab, setActiveTab] = useState<'series' | 'balance' | 'matrix'>('series');

    // 数据状态
    const [seriesList, setSeriesList] = useState<ContentSeries[]>([]);
    const [balanceReport, setBalanceReport] = useState<PillarBalanceReport | null>(null);
    const [matrixList, setMatrixList] = useState<AccountMatrixItem[]>([]);
    const [loading, setLoading] = useState(false);

    // 新建系列弹窗
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [form, setForm] = useState({
        title: '',
        description: '',
        targetPillar: '',
        plannedCount: 5
    });

    useEffect(() => {
        if (!accountId) return;
        loadData();
    }, [accountId, activeTab]);

    const loadData = async () => {
        if (!accountId) return;
        setLoading(true);
        try {
            if (activeTab === 'series') {
                const res = await axios.get(`/api/series?accountId=${accountId}`);
                setSeriesList(res.data);
            } else if (activeTab === 'balance') {
                const res = await axios.get(`/api/series/pillar-balance?accountId=${accountId}`);
                setBalanceReport(res.data.balance);
            } else if (activeTab === 'matrix') {
                const res = await axios.get('/api/series/matrix');
                setMatrixList(res.data.matrix);
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || '加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSeries = async () => {
        if (!accountId) return toast.error('请先选择账号');
        if (!form.title.trim()) return toast.error('请填写专栏标题');

        try {
            await axios.post('/api/series', {
                accountId,
                title: form.title,
                description: form.description,
                targetPillar: form.targetPillar,
                plannedCount: Number(form.plannedCount)
            });

            toast.success('系列专栏已创建');
            setIsCreateModalOpen(false);
            setForm({
                title: '',
                description: '',
                targetPillar: '',
                plannedCount: 5
            });
            loadData();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '创建失败');
        }
    };

    const handleSwitchAccount = async (targetId: number) => {
        try {
            await axios.post(`/api/accounts/${targetId}/active`);
            await refreshAccount();
            toast.success('已切换工作账号');
        } catch (e: any) {
            toast.error('切换失败');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FolderGit2 className="w-6 h-6 text-sky-600" />
                        系列专栏与矩阵规划 (P3.2 Series & Matrix)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        将零散内容组织为高粘性专题，监控内容栏目配比平衡，统一掌控多账号协同矩阵。
                    </p>
                </div>
                {activeTab === 'series' && (
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        新建系列专栏
                    </button>
                )}
            </div>

            {!activeAccount && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-3 text-yellow-800 dark:text-yellow-200 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>请在系统顶部选择要操作的目标账号。</span>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-border pb-1">
                <button
                    onClick={() => setActiveTab('series')}
                    className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                        activeTab === 'series'
                            ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <BookOpen size={14} />
                    系列专栏工程 ({seriesList.length})
                </button>
                <button
                    onClick={() => setActiveTab('balance')}
                    className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                        activeTab === 'balance'
                            ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <BarChart2 size={14} />
                    栏目配比健康度
                </button>
                <button
                    onClick={() => setActiveTab('matrix')}
                    className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                        activeTab === 'matrix'
                            ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Users2 size={14} />
                    跨账号矩阵总览
                </button>
            </div>

            {/* Content Body */}
            {loading ? (
                <div className="text-center py-16 text-xs text-gray-400">加载中...</div>
            ) : activeTab === 'series' ? (
                seriesList.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed rounded-xl border-border space-y-2">
                        <FolderGit2 className="w-10 h-10 text-gray-300 mx-auto" />
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">暂无系列专栏</p>
                        <p className="text-xs text-gray-400">创建类似《双轴云台从零到一》《硬件避坑30讲》等系统性专栏，显著提升完结率与粉丝粘性</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {seriesList.map(ser => (
                            <div
                                key={ser.id}
                                className="bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                            {ser.targetPillar || '综合栏目'}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            ser.status === 'COMPLETED'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {ser.status === 'COMPLETED' ? '已完结' : '连载中'}
                                        </span>
                                    </div>
                                    <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 mb-1">{ser.title}</h3>
                                    <p className="text-xs text-gray-500 line-clamp-2">{ser.description || '暂无专栏描述'}</p>
                                </div>

                                <div className="space-y-2 pt-3 border-t">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500 font-medium">更新进度</span>
                                        <span className="font-bold text-sky-600">
                                            {ser.completedCount} / {ser.plannedCount} 篇 ({ser.progressPercentage}%)
                                        </span>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-sky-600 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${ser.progressPercentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : activeTab === 'balance' ? (
                balanceReport && (
                    <div className="space-y-5">
                        {/* 智能建议卡片 */}
                        <div className="p-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl flex items-center gap-3 text-xs text-sky-900 dark:text-sky-200">
                            <CheckCircle2 className="w-5 h-5 text-sky-600 flex-shrink-0" />
                            <div>
                                <span className="font-bold mr-1">栏目配比诊断建议：</span>
                                {balanceReport.recommendation}
                            </div>
                        </div>

                        {/* 栏目分布表格 */}
                        <div className="bg-white dark:bg-gray-900 border rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 dark:bg-gray-800 border-b text-gray-600 dark:text-gray-300">
                                    <tr>
                                        <th className="p-3">内容栏目</th>
                                        <th className="p-3">目标占比配比</th>
                                        <th className="p-3">实际已产出篇数</th>
                                        <th className="p-3">当前实际占比</th>
                                        <th className="p-3">健康状态诊断</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {balanceReport.pillars.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                            <td className="p-3 font-bold">{p.name}</td>
                                            <td className="p-3 font-mono">{p.targetRatio}%</td>
                                            <td className="p-3 font-mono">{p.currentCount} 篇</td>
                                            <td className="p-3 font-mono">{p.currentRatio}%</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded font-bold ${
                                                    p.status === 'BALANCED'
                                                        ? 'bg-green-100 text-green-700'
                                                        : p.status === 'UNDER'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                    {p.status === 'BALANCED' ? '均衡健康' : p.status === 'UNDER' ? '偏少需补充' : '过度扎堆'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            ) : (
                /* Matrix Overview */
                <div className="bg-white dark:bg-gray-900 border rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 dark:bg-gray-800 border-b text-gray-600 dark:text-gray-300">
                            <tr>
                                <th className="p-3">博主账号</th>
                                <th className="p-3">账号状态</th>
                                <th className="p-3">待决策机会卡</th>
                                <th className="p-3">内容包资产</th>
                                <th className="p-3">专栏系列数</th>
                                <th className="p-3">已发布笔记数</th>
                                <th className="p-3 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {matrixList.map(item => (
                                <tr key={item.accountId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                    <td className="p-3 font-bold flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${item.accountId === accountId ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                        <span>{item.nickname}</span>
                                        {item.accountId === accountId && (
                                            <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">当前操作中</span>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <span className="text-green-600 font-bold">在线正常</span>
                                    </td>
                                    <td className="p-3 font-mono">{item.opportunitiesCount} 个</td>
                                    <td className="p-3 font-mono">{item.packagesCount} 个</td>
                                    <td className="p-3 font-mono">{item.seriesCount} 个</td>
                                    <td className="p-3 font-mono">{item.publishedNotesCount} 篇</td>
                                    <td className="p-3 text-right">
                                        {item.accountId !== accountId && (
                                            <button
                                                onClick={() => handleSwitchAccount(item.accountId)}
                                                className="px-2.5 py-1 text-sky-600 hover:bg-sky-50 rounded font-semibold transition-colors"
                                            >
                                                切至该账号
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal: 创建系列专栏 */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6 space-y-4 border shadow-xl">
                        <h2 className="text-lg font-bold">新建系列专栏工程</h2>
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">专栏名称 *</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="例如：双轴无刷云台调参30讲"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">专栏简介</label>
                                <textarea
                                    rows={2}
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="介绍该专栏要解决的核心读者痛点与终极交付"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">关联栏目</label>
                                    <input
                                        type="text"
                                        value={form.targetPillar}
                                        onChange={e => setForm({ ...form, targetPillar: e.target.value })}
                                        placeholder="硬件避坑"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">规划篇数</label>
                                    <input
                                        type="number"
                                        value={form.plannedCount}
                                        onChange={e => setForm({ ...form, plannedCount: Number(e.target.value) })}
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateSeries}
                                className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                            >
                                立即创建
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
