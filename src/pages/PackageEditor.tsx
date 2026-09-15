import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { useAccount } from '@/context/AccountContext';
import { Layers, Plus, History, Send, Check, AlertCircle, FileEdit, Sparkles, Tag, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ContentPackageVersion {
    id?: number;
    versionNumber: number;
    title: string;
    targetAudience?: string;
    coreValueProposition?: string;
    keyPoints: string[];
    bodyMarkdown: string;
    coverTitleOptions: string[];
    tags: string[];
    changeSummary?: string;
    createdAt?: string;
}

interface ContentPackage {
    id: string;
    accountId: number;
    opportunityId?: string;
    title: string;
    targetAudience?: string;
    coreValueProposition?: string;
    keyPoints: string[];
    bodyMarkdown: string;
    coverTitleOptions: string[];
    tags: string[];
    currentVersion: number;
    linkedDraftId?: number;
    versions: ContentPackageVersion[];
    createdAt?: string;
    updatedAt?: string;
}

export default function PackageEditor() {
    const { activeAccount } = useAccount();
    const accountId = activeAccount?.id;

    // 列表与选中
    const [packages, setPackages] = useState<ContentPackage[]>([]);
    const [activePackageId, setActivePackageId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // 编辑器表单（工作区）
    const [form, setForm] = useState({
        title: '',
        targetAudience: '',
        coreValueProposition: '',
        keyPointsText: '',
        bodyMarkdown: '',
        coverTitleOptionsText: '',
        tagsText: '',
        changeSummary: ''
    });

    // 历史版本抽屉
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<ContentPackageVersion | null>(null);

    // 新建弹窗
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newPkgTitle, setNewPkgTitle] = useState('');

    useEffect(() => {
        if (!accountId) return;
        loadPackages();
    }, [accountId]);

    const loadPackages = async () => {
        if (!accountId) return;
        setLoading(true);
        try {
            const res = await axios.get(`/api/packages?accountId=${accountId}`);
            setPackages(res.data);
            if (res.data.length > 0 && !activePackageId) {
                selectPackage(res.data[0]);
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || '加载内容包失败');
        } finally {
            setLoading(false);
        }
    };

    const selectPackage = (pkg: ContentPackage) => {
        setActivePackageId(pkg.id);
        setForm({
            title: pkg.title || '',
            targetAudience: pkg.targetAudience || '',
            coreValueProposition: pkg.coreValueProposition || '',
            keyPointsText: (pkg.keyPoints || []).join('\n'),
            bodyMarkdown: pkg.bodyMarkdown || '',
            coverTitleOptionsText: (pkg.coverTitleOptions || []).join('\n'),
            tagsText: (pkg.tags || []).join(', '),
            changeSummary: ''
        });
        setSelectedHistoryVersion(null);
    };

    const activePkg = packages.find(p => p.id === activePackageId);

    const handleCreatePackage = async () => {
        if (!accountId) return toast.error('请先选择账号');
        if (!newPkgTitle.trim()) return toast.error('请填写内容包标题');

        try {
            const res = await axios.post('/api/packages', {
                accountId,
                title: newPkgTitle,
                bodyMarkdown: '# ' + newPkgTitle + '\n\n开始撰写你的正文...',
                keyPoints: [],
                coverTitleOptions: [],
                tags: []
            });
            toast.success('内容包创建成功');
            setIsCreateModalOpen(false);
            setNewPkgTitle('');
            await loadPackages();
            selectPackage(res.data.package);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '创建失败');
        }
    };

    const handleCommitNewVersion = async () => {
        if (!activePackageId) return;
        if (!form.title.trim() || !form.bodyMarkdown.trim()) {
            return toast.error('标题与正文不可为空');
        }

        try {
            const keyPoints = form.keyPointsText.split('\n').map(s => s.trim()).filter(Boolean);
            const coverTitleOptions = form.coverTitleOptionsText.split('\n').map(s => s.trim()).filter(Boolean);
            const tags = form.tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean);

            const res = await axios.post(`/api/packages/${activePackageId}/versions`, {
                title: form.title,
                targetAudience: form.targetAudience,
                coreValueProposition: form.coreValueProposition,
                keyPoints,
                bodyMarkdown: form.bodyMarkdown,
                coverTitleOptions,
                tags,
                changeSummary: form.changeSummary || `润色修改 (v${(activePkg?.currentVersion || 1) + 1})`
            });

            toast.success(`新版本 v${res.data.package.currentVersion} 固化成功`);
            setForm(prev => ({ ...prev, changeSummary: '' }));
            await loadPackages();
            // 重新选定
            const updated = res.data.package;
            selectPackage(updated);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '版本提交失败');
        }
    };

    const handleExportDraft = async () => {
        if (!activePackageId) return;
        try {
            const res = await axios.post(`/api/packages/${activePackageId}/export-draft`);
            toast.success(`已同步到传统草稿箱 (Draft ID: ${res.data.draftId})`);
            await loadPackages();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '导出草稿失败');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Layers className="w-6 h-6 text-red-600" />
                        内容包与版本工作台 (P1.3 Content Packages)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        不仅仅是单一文案。包含受众、核心主张、论点卡、多套封面标题备选与不可篡改的版本快照树。
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        新建内容包
                    </button>
                    {activePkg && (
                        <button
                            onClick={handleExportDraft}
                            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium flex items-center gap-1.5 border transition-colors"
                        >
                            <Send className="w-4 h-4" />
                            {activePkg.linkedDraftId ? `同步更新草稿 (#${activePkg.linkedDraftId})` : '导出到发布草稿箱'}
                        </button>
                    )}
                </div>
            </div>

            {!activeAccount && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-3 text-yellow-800 dark:text-yellow-200 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>请在系统顶部选择要操作的目标账号。</span>
                </div>
            )}

            {/* Main Studio Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* 左侧：内容包列表 (3 cols) */}
                <div className="lg:col-span-3 bg-white dark:bg-gray-900 border rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between border-b pb-2">
                        <span className="text-xs font-bold text-gray-500">内容包清单 ({packages.length})</span>
                    </div>

                    {loading ? (
                        <div className="text-center py-8 text-xs text-gray-400">加载中...</div>
                    ) : packages.length === 0 ? (
                        <div className="text-center py-8 text-xs text-gray-400">暂无内容包，点击右上角新建</div>
                    ) : (
                        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                            {packages.map(pkg => (
                                <div
                                    key={pkg.id}
                                    onClick={() => selectPackage(pkg)}
                                    className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                                        pkg.id === activePackageId
                                            ? 'border-red-600 bg-red-50/40 dark:bg-red-950/20'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-300">
                                            v{pkg.currentVersion}
                                        </span>
                                        <span className="text-[10px] text-gray-400">
                                            {pkg.updatedAt?.slice(5, 10)}
                                        </span>
                                    </div>
                                    <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 line-clamp-2">
                                        {pkg.title}
                                    </h4>
                                    {pkg.linkedDraftId && (
                                        <span className="text-[10px] text-green-600 mt-1 block">
                                            已关联草稿 #{pkg.linkedDraftId}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 中间/右侧：结构化多维编辑器 (9 cols) */}
                {activePkg ? (
                    <div className="lg:col-span-9 space-y-5">
                        {/* 顶栏操作区：版本号与操作 */}
                        <div className="bg-white dark:bg-gray-900 border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                            <div className="flex items-center gap-3">
                                <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-xs font-extrabold rounded-md">
                                    当前活跃版本: v{activePkg.currentVersion}
                                </span>
                                <span className="text-xs text-gray-500">
                                    历史快照: 共 {activePkg.versions.length} 个固化版本
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-xs font-medium rounded-lg border hover:bg-gray-200 flex items-center gap-1"
                                >
                                    <History className="w-3.5 h-3.5" />
                                    {isHistoryOpen ? '收起版本树' : '版本演进历史'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCommitNewVersion}
                                    className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 flex items-center gap-1 shadow-sm"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    固化并保存新版本 (Commit)
                                </button>
                            </div>
                        </div>

                        {/* 如果展开了历史版本对比抽屉 */}
                        {isHistoryOpen && (
                            <div className="bg-gray-50 dark:bg-gray-950 border rounded-xl p-4 space-y-3">
                                <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                    <History className="w-4 h-4 text-purple-600" />
                                    版本演进不可变快照 (不可篡改、随时回溯)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    {activePkg.versions.map(v => (
                                        <div
                                            key={v.versionNumber}
                                            onClick={() => setSelectedHistoryVersion(v)}
                                            className={`p-3 rounded-lg border cursor-pointer text-xs ${
                                                selectedHistoryVersion?.versionNumber === v.versionNumber
                                                    ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/40'
                                                    : 'bg-white dark:bg-gray-900 hover:border-gray-400'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between font-bold mb-1">
                                                <span>版本 v{v.versionNumber}</span>
                                                <span className="text-[10px] text-gray-400">{v.createdAt?.slice(11, 16)}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 line-clamp-2">
                                                {v.changeSummary || '无改动说明'}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                {selectedHistoryVersion && (
                                    <div className="p-3 bg-white dark:bg-gray-900 border rounded-lg text-xs space-y-2 mt-2">
                                        <div className="flex items-center justify-between font-bold border-b pb-1">
                                            <span>快照详情：v{selectedHistoryVersion.versionNumber} - {selectedHistoryVersion.title}</span>
                                            <button
                                                onClick={() => {
                                                    // 回滚到此版本的数据到当前表单
                                                    setForm({
                                                        title: selectedHistoryVersion.title,
                                                        targetAudience: selectedHistoryVersion.targetAudience || '',
                                                        coreValueProposition: selectedHistoryVersion.coreValueProposition || '',
                                                        keyPointsText: selectedHistoryVersion.keyPoints.join('\n'),
                                                        bodyMarkdown: selectedHistoryVersion.bodyMarkdown,
                                                        coverTitleOptionsText: selectedHistoryVersion.coverTitleOptions.join('\n'),
                                                        tagsText: selectedHistoryVersion.tags.join(', '),
                                                        changeSummary: `回滚/采纳自历史版本 v${selectedHistoryVersion.versionNumber}`
                                                    });
                                                    toast.success(`已载入 v${selectedHistoryVersion.versionNumber} 内容至编辑器`);
                                                }}
                                                className="text-purple-600 hover:underline font-semibold"
                                            >
                                                以此版本作为新编辑基准
                                            </button>
                                        </div>
                                        <pre className="p-2 bg-gray-50 dark:bg-gray-950 rounded text-[11px] max-h-40 overflow-y-auto whitespace-pre-wrap">
                                            {selectedHistoryVersion.bodyMarkdown}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 结构化编辑器表单 */}
                        <div className="bg-white dark:bg-gray-900 border rounded-xl p-5 space-y-4 shadow-sm">
                            {/* 标题与改动备忘 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        笔记标题 (Title) *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.title}
                                        onChange={e => setForm({ ...form, title: e.target.value })}
                                        placeholder="例如：无刷云台抗强光调试实操清单"
                                        className="w-full border rounded-lg p-2.5 text-sm bg-transparent font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        本版修改备忘 (Change Summary)
                                    </label>
                                    <input
                                        type="text"
                                        value={form.changeSummary}
                                        onChange={e => setForm({ ...form, changeSummary: e.target.value })}
                                        placeholder="例如：删减AI废话，强化实操"
                                        className="w-full border rounded-lg p-2.5 text-sm bg-transparent"
                                    />
                                </div>
                            </div>

                            {/* 受众画像与核心价值主张 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        精准读者群 (Target Audience)
                                    </label>
                                    <input
                                        type="text"
                                        value={form.targetAudience}
                                        onChange={e => setForm({ ...form, targetAudience: e.target.value })}
                                        placeholder="例如：刚入门电赛的测控与自动化大二学生"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        核心价值交付 (Core Value Proposition)
                                    </label>
                                    <input
                                        type="text"
                                        value={form.coreValueProposition}
                                        onChange={e => setForm({ ...form, coreValueProposition: e.target.value })}
                                        placeholder="例如：看完立刻明白共地接法，绝不再烧管"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                            </div>

                            {/* 3个论点卡 / 避坑点 */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    核心论点卡 / 避坑要点 (Key Points - 每行一个要点)
                                </label>
                                <textarea
                                    rows={3}
                                    value={form.keyPointsText}
                                    onChange={e => setForm({ ...form, keyPointsText: e.target.value })}
                                    placeholder="1. 区分功率地与小信号地，严禁单点大电流回流穿过MCU&#10;2. 调低速度环I增益，消除高频啸叫发热&#10;3. 采用405nm狭带滤波片抑制日光冲刷"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent font-mono"
                                />
                            </div>

                            {/* 正文脚本 Markdown */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    正文脚本 (Body Markdown / Script) *
                                </label>
                                <textarea
                                    rows={10}
                                    value={form.bodyMarkdown}
                                    onChange={e => setForm({ ...form, bodyMarkdown: e.target.value })}
                                    placeholder="输入结构化正文或图文逐页讲解文案..."
                                    className="w-full border rounded-lg p-3 text-sm bg-transparent font-mono leading-relaxed"
                                />
                            </div>

                            {/* 封面标题建议备选池与标签 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        首图/封面文案备选 (Cover Title Options - 每行一条)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={form.coverTitleOptionsText}
                                        onChange={e => setForm({ ...form, coverTitleOptionsText: e.target.value })}
                                        placeholder="电机又烧了？快查这根地线！&#10;新手避坑：云台接线致命3误区"
                                        className="w-full border rounded-lg p-2 text-xs bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        标签话题 (Tags - 逗号分隔)
                                    </label>
                                    <input
                                        type="text"
                                        value={form.tagsText}
                                        onChange={e => setForm({ ...form, tagsText: e.target.value })}
                                        placeholder="STM32, 电赛, 机器人, 无刷电机"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="lg:col-span-9 bg-white dark:bg-gray-900 border rounded-xl p-16 text-center text-gray-400">
                        请在左侧选择一个内容包，或点击右上角创建新内容包
                    </div>
                )}
            </div>

            {/* Modal: 创建内容包 */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6 space-y-4 border shadow-xl">
                        <h2 className="text-lg font-bold">新建结构化内容包</h2>
                        <div>
                            <label className="block text-xs font-semibold mb-1 text-gray-600">内容包主题 / 暂定标题 *</label>
                            <input
                                type="text"
                                value={newPkgTitle}
                                onChange={e => setNewPkgTitle(e.target.value)}
                                placeholder="例如：无刷云台调参避坑全指南"
                                className="w-full border rounded-lg p-2 text-sm bg-transparent"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreatePackage}
                                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
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
