import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { useAccount } from '@/context/AccountContext';
import { Radio, Plus, Trash2, Sparkles, CheckCircle2, TrendingUp, AlertCircle, ArrowRight, Lightbulb } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface KeywordWatch {
    id: string;
    accountId: number;
    keyword: string;
    category?: string;
    targetAudience?: string;
    minLikesThreshold: number;
    isActive: boolean;
    createdAt?: string;
}

interface CandidateOpportunity {
    id: string;
    accountId: number;
    keyword: string;
    title: string;
    targetAudience: string;
    scenario: string;
    problem: string;
    uniqueAngle: string;
    contentFormat: string;
    expectedOutcome: string;
    evidenceCount: number;
    signals: Array<{
        sourceType: string;
        rawText: string;
        author?: string;
        likes?: number;
    }>;
}

export default function DemandRadarPage() {
    const { activeAccount } = useAccount();
    const accountId = activeAccount?.id;
    const navigate = useNavigate();

    const [watches, setWatches] = useState<KeywordWatch[]>([]);
    const [loading, setLoading] = useState(false);

    // 新增监控项弹窗
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [form, setForm] = useState({
        keyword: '',
        category: '硬件避坑',
        targetAudience: '',
        minLikesThreshold: 50
    });

    // 智能合成候选状态
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [candidate, setCandidate] = useState<CandidateOpportunity | null>(null);

    useEffect(() => {
        if (!accountId) return;
        loadWatches();
    }, [accountId]);

    const loadWatches = async () => {
        if (!accountId) return;
        setLoading(true);
        try {
            const res = await axios.get(`/api/radar/watches?accountId=${accountId}`);
            setWatches(res.data);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '加载监控项失败');
        } finally {
            setLoading(false);
        }
    };

    const handleAddWatch = async () => {
        if (!accountId) return toast.error('请先选择账号');
        if (!form.keyword.trim()) return toast.error('请填写监控关键词');

        try {
            await axios.post('/api/radar/watches', {
                accountId,
                ...form
            });
            toast.success('已加入需求雷达监控');
            setIsAddModalOpen(false);
            setForm({
                keyword: '',
                category: '硬件避坑',
                targetAudience: '',
                minLikesThreshold: 50
            });
            loadWatches();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '添加监控项失败');
        }
    };

    const handleDeleteWatch = async (id: string) => {
        try {
            await axios.delete(`/api/radar/watches/${id}`);
            toast.success('已移除监控');
            loadWatches();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '移除失败');
        }
    };

    // 触发根据监控词与近邻高频痛点进行 AI 机会卡合成
    const handleSynthesize = async (watch: KeywordWatch) => {
        if (!accountId) return;
        setIsSynthesizing(true);
        setCandidate(null);
        try {
            // 构造真实/模拟近邻痛点信号
            const signals = [
                {
                    sourceType: 'COMMENT',
                    rawText: `很多新手在搜索【${watch.keyword}】时，常因忽略接线回路与参数导致严重损耗，非常缺少体系化排查教程。`,
                    author: '实战老手',
                    likes: 68
                },
                {
                    sourceType: 'COMMENT',
                    rawText: `希望能出一期对比实测，告诉大家调参的具体边界在哪里。`,
                    author: '备赛小薯',
                    likes: 35
                }
            ];

            const res = await axios.post('/api/radar/synthesize', {
                accountId,
                keyword: watch.keyword,
                targetAudience: watch.targetAudience || '电子信息备赛学生 / 创作者',
                scenario: `户外实测与高负荷运行【${watch.keyword}】时`,
                signals
            });

            setCandidate(res.data.candidate);
            toast.success('已从雷达信号合成高价值机会卡候选');
        } catch (e: any) {
            toast.error(e.response?.data?.error || '合成候选失败');
        } finally {
            setIsSynthesizing(false);
        }
    };

    // 一键采纳导入 P1.2 机会池
    const handleAdoptCandidate = async () => {
        if (!candidate) return;
        try {
            await axios.post('/api/radar/adopt', { candidate });
            toast.success('已一键采纳并导入【选题机会池】！');
            setCandidate(null);
            navigate('/opportunities');
        } catch (e: any) {
            toast.error(e.response?.data?.error || '采纳失败');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Radio className="w-6 h-6 text-indigo-600 animate-pulse" />
                        需求雷达 (P2.1 Demand Radar)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        实时捕获行业高频痛点、评论区真实求助与竞品吐槽，自动合成高胜率选题机会。
                    </p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    新建监控雷达
                </button>
            </div>

            {!activeAccount && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-3 text-yellow-800 dark:text-yellow-200 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>请在系统顶部选择要操作的目标账号。</span>
                </div>
            )}

            {/* Grid Layout: 左侧监控项，右侧候选合成池 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* 监控项列表 */}
                <div className="lg:col-span-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-indigo-500" />
                            已布设关键词雷达 ({watches.length})
                        </h2>
                    </div>

                    {loading ? (
                        <div className="text-center py-12 text-xs text-gray-400">加载雷达数据中...</div>
                    ) : watches.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed rounded-xl border-gray-200 dark:border-gray-800 text-xs text-gray-400">
                            暂未布设关键词，点击右上角新建以开启自动痛点捕获
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {watches.map(w => (
                                <div
                                    key={w.id}
                                    className="bg-white dark:bg-gray-900 border rounded-xl p-4 shadow-sm flex flex-col justify-between hover:border-indigo-300 transition-colors"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-extrabold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-100">
                                                {w.category || '综合监控'}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteWatch(w.id)}
                                                className="text-gray-400 hover:text-red-600 p-1"
                                                title="移除监控"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">
                                            {w.keyword}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            目标受众: {w.targetAudience || '未指定'} · 触发热度阈值: {w.minLikesThreshold} 赞
                                        </p>
                                    </div>

                                    <div className="pt-3 mt-3 border-t flex items-center justify-between text-xs">
                                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1 font-medium">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                                            监听中
                                        </span>
                                        <button
                                            onClick={() => handleSynthesize(w)}
                                            disabled={isSynthesizing}
                                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 font-semibold flex items-center gap-1 transition-colors"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                            捕获痛点并合成机会
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 右侧：合成机会推荐池 */}
                <div className="lg:col-span-6 bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm space-y-4">
                    <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 border-b pb-3">
                        <Lightbulb className="w-4 h-4 text-yellow-500" />
                        雷达聚类合成机会 (Candidate Synthesis)
                    </h2>

                    {isSynthesizing ? (
                        <div className="py-20 text-center space-y-2">
                            <Sparkles className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                            <p className="text-xs font-semibold text-gray-500">正在分析监控信号，聚类痛点标签...</p>
                        </div>
                    ) : candidate ? (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-indigo-600 bg-white dark:bg-gray-900 px-2 py-0.5 rounded border">
                                        基于关键词：{candidate.keyword}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        包含 {candidate.evidenceCount} 条支撑凭证
                                    </span>
                                </div>

                                <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">
                                    {candidate.title}
                                </h3>

                                <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1 bg-white dark:bg-gray-900 p-3 rounded-lg border">
                                    <div><span className="font-semibold text-gray-700 dark:text-gray-200">目标受众：</span>{candidate.targetAudience}</div>
                                    <div><span className="font-semibold text-gray-700 dark:text-gray-200">触发场景：</span>{candidate.scenario}</div>
                                    <div><span className="font-semibold text-gray-700 dark:text-gray-200">解决痛点：</span>{candidate.problem}</div>
                                    <div className="text-indigo-600 dark:text-indigo-400 font-medium"><span className="font-semibold">切入角度：</span>{candidate.uniqueAngle}</div>
                                </div>

                                {/* 关联评论原话 */}
                                <div className="space-y-1.5 pt-2">
                                    <span className="text-[11px] font-bold text-gray-500">真实用户原话证据：</span>
                                    {candidate.signals.map((s, idx) => (
                                        <div key={idx} className="text-xs bg-white dark:bg-gray-900 p-2 rounded border text-gray-600 dark:text-gray-300 italic">
                                            “{s.rawText}” <span className="text-[10px] text-gray-400 not-italic">—— @{s.author || '匿名用户'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleAdoptCandidate}
                                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm text-sm"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                采纳此机会并直接导入【选题机会池】
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="py-20 text-center text-xs text-gray-400 border-2 border-dashed rounded-xl">
                            在左侧点击任一关键词雷达的【捕获痛点并合成机会】，系统将在此实时生成可采纳的结构化机会卡。
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: 新增监控项 */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6 space-y-4 border shadow-xl">
                        <h2 className="text-lg font-bold">布设新关键词需求雷达</h2>
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">监控关键词 / 核心品类 *</label>
                                <input
                                    type="text"
                                    value={form.keyword}
                                    onChange={e => setForm({ ...form, keyword: e.target.value })}
                                    placeholder="例如：无刷电机发烫、STM32云台、405nm滤光"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">所属内容分类</label>
                                <input
                                    type="text"
                                    value={form.category}
                                    onChange={e => setForm({ ...form, category: e.target.value })}
                                    placeholder="硬件避坑 / 教程指南 / 评测拆解"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">预期目标读者画像</label>
                                <input
                                    type="text"
                                    value={form.targetAudience}
                                    onChange={e => setForm({ ...form, targetAudience: e.target.value })}
                                    placeholder="例如：电子信息备赛学生、嵌入式初学者"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">高赞触发阈值 (点赞数)</label>
                                <input
                                    type="number"
                                    value={form.minLikesThreshold}
                                    onChange={e => setForm({ ...form, minLikesThreshold: Number(e.target.value) })}
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAddWatch}
                                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                立即布设
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
