import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { useAccount } from '@/context/AccountContext';
import { RotateCcw, Plus, Lightbulb, TrendingUp, AlertCircle, ArrowRight, CheckCircle2, MessageSquare, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface NoteReview {
    id: string;
    accountId: number;
    noteId?: string;
    title: string;
    publishedAt?: string;
    views: number;
    likes: number;
    collects: number;
    comments: number;
    ctrAssessment?: 'HIGH' | 'NORMAL' | 'LOW';
    interactionAssessment?: 'HIGH' | 'NORMAL' | 'LOW';
    whatWorked?: string;
    whatFailed?: string;
    feedbackSignals: string[];
    nextActionIdeas: string[];
    createdAt?: string;
}

export default function NoteReviewPage() {
    const { activeAccount } = useAccount();
    const accountId = activeAccount?.id;
    const navigate = useNavigate();

    const [reviews, setReviews] = useState<NoteReview[]>([]);
    const [loading, setLoading] = useState(false);

    // 新增复盘弹窗
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [form, setForm] = useState({
        title: '',
        publishedAt: new Date().toISOString().split('T')[0],
        views: 0,
        likes: 0,
        collects: 0,
        comments: 0,
        ctrAssessment: 'NORMAL' as 'HIGH' | 'NORMAL' | 'LOW',
        interactionAssessment: 'NORMAL' as 'HIGH' | 'NORMAL' | 'LOW',
        whatWorked: '',
        whatFailed: '',
        feedbackSignalsText: '',
        nextActionIdeasText: ''
    });

    useEffect(() => {
        if (!accountId) return;
        loadReviews();
    }, [accountId]);

    const loadReviews = async () => {
        if (!accountId) return;
        setLoading(true);
        try {
            const res = await axios.get(`/api/reviews?accountId=${accountId}`);
            setReviews(res.data);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '加载复盘列表失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateReview = async () => {
        if (!accountId) return toast.error('请先选择账号');
        if (!form.title.trim()) return toast.error('请填写复盘笔记标题');

        try {
            const feedbackSignals = form.feedbackSignalsText.split('\n').map(s => s.trim()).filter(Boolean);
            const nextActionIdeas = form.nextActionIdeasText.split('\n').map(s => s.trim()).filter(Boolean);

            await axios.post('/api/reviews', {
                accountId,
                title: form.title,
                publishedAt: form.publishedAt,
                views: Number(form.views),
                likes: Number(form.likes),
                collects: Number(form.collects),
                comments: Number(form.comments),
                ctrAssessment: form.ctrAssessment,
                interactionAssessment: form.interactionAssessment,
                whatWorked: form.whatWorked,
                whatFailed: form.whatFailed,
                feedbackSignals,
                nextActionIdeas
            });

            toast.success('笔记复盘记录已归档');
            setIsCreateModalOpen(false);
            setForm({
                title: '',
                publishedAt: new Date().toISOString().split('T')[0],
                views: 0,
                likes: 0,
                collects: 0,
                comments: 0,
                ctrAssessment: 'NORMAL',
                interactionAssessment: 'NORMAL',
                whatWorked: '',
                whatFailed: '',
                feedbackSignalsText: '',
                nextActionIdeasText: ''
            });
            loadReviews();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '创建复盘失败');
        }
    };

    // 一键反哺生成 P1.2 内容机会卡
    const handleDeriveOpportunity = async (reviewId: string, ideaIndex: number) => {
        try {
            const res = await axios.post(`/api/reviews/${reviewId}/derive-opportunity`, {
                ideaIndex
            });
            toast.success(`已反哺生成新机会卡: 《${res.data.opportunity.title}》`);
            navigate('/opportunities');
        } catch (e: any) {
            toast.error(e.response?.data?.error || '生成机会卡失败');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <RotateCcw className="w-6 h-6 text-emerald-600" />
                        笔记复盘与闭环 (P2.4 Feedback Loop)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        不仅是记账统计。提炼每一篇笔记的真实用户卡点与亮点，一键反哺为下一期高胜率内容机会卡。
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    新建笔记复盘
                </button>
            </div>

            {!activeAccount && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-3 text-yellow-800 dark:text-yellow-200 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>请在系统顶部选择要操作的目标账号。</span>
                </div>
            )}

            {/* List of Reviews */}
            {loading ? (
                <div className="text-center py-16 text-xs text-gray-400">加载复盘记录中...</div>
            ) : reviews.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed rounded-xl border-gray-200 dark:border-gray-800 space-y-2">
                    <RotateCcw className="w-10 h-10 text-gray-300 mx-auto" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">暂无笔记复盘记录</p>
                    <p className="text-xs text-gray-400">发布后记录真实反馈与读者评论，让每一次发文都变成下一次创新的燃料</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {reviews.map(rev => (
                        <div
                            key={rev.id}
                            className="bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm space-y-4 hover:border-emerald-300 transition-colors"
                        >
                            {/* Top info */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b pb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">{rev.title}</h3>
                                        <span className="text-[11px] text-gray-400">发布于 {rev.publishedAt || rev.createdAt?.slice(0, 10)}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-500 font-medium">
                                        <span>阅读: <b className="text-gray-800 dark:text-gray-200">{rev.views}</b></span>
                                        <span>点赞: <b className="text-gray-800 dark:text-gray-200">{rev.likes}</b></span>
                                        <span>收藏: <b className="text-emerald-600 dark:text-emerald-400">{rev.collects}</b></span>
                                        <span>评论: <b className="text-gray-800 dark:text-gray-200">{rev.comments}</b></span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                        rev.ctrAssessment === 'HIGH' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        封面点击率: {rev.ctrAssessment === 'HIGH' ? '高' : rev.ctrAssessment === 'LOW' ? '偏低' : '正常'}
                                    </span>
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                        rev.interactionAssessment === 'HIGH' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        内容深度: {rev.interactionAssessment === 'HIGH' ? '高干货' : '一般'}
                                    </span>
                                </div>
                            </div>

                            {/* What worked & What failed */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div className="p-3 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-lg space-y-1">
                                    <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                        <CheckCircle2 size={13} /> 验证成功的亮点 (What Worked)
                                    </span>
                                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                        {rev.whatWorked || '暂未填写亮点总结'}
                                    </p>
                                </div>

                                <div className="p-3 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50 rounded-lg space-y-1">
                                    <span className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1">
                                        <AlertCircle size={13} /> 踩坑与读者卡点 (What Failed)
                                    </span>
                                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                        {rev.whatFailed || '暂未填写不足与读者困惑'}
                                    </p>
                                </div>
                            </div>

                            {/* User Feedback Signals */}
                            {rev.feedbackSignals && rev.feedbackSignals.length > 0 && (
                                <div className="space-y-1.5 text-xs bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border">
                                    <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                        <MessageSquare size={13} className="text-blue-500" /> 用户评论区集中反馈信号
                                    </span>
                                    <div className="space-y-1">
                                        {rev.feedbackSignals.map((sig, idx) => (
                                            <div key={idx} className="text-gray-600 dark:text-gray-400 italic">
                                                • “{sig}”
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Next Action Ideas - 一键反哺生成机会卡 */}
                            {rev.nextActionIdeas && rev.nextActionIdeas.length > 0 && (
                                <div className="space-y-2 pt-2 border-t">
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                        <Sparkles size={13} className="text-yellow-500" /> 下一步选题改进与反哺动作
                                    </span>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {rev.nextActionIdeas.map((idea, idx) => (
                                            <div
                                                key={idx}
                                                className="p-2.5 rounded-lg border bg-white dark:bg-gray-900 flex items-center justify-between gap-2 text-xs"
                                            >
                                                <span className="font-medium text-gray-800 dark:text-gray-200 line-clamp-1">
                                                    {idea}
                                                </span>
                                                <button
                                                    onClick={() => handleDeriveOpportunity(rev.id, idx)}
                                                    className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded font-semibold flex items-center gap-1 flex-shrink-0 transition-colors"
                                                >
                                                    反哺为新选题 <ArrowRight size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal: 创建复盘 */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-xl w-full p-6 space-y-4 border shadow-xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-lg font-bold">新建已发笔记深度复盘</h2>
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">复盘笔记标题 *</label>
                                    <input
                                        type="text"
                                        value={form.title}
                                        onChange={e => setForm({ ...form, title: e.target.value })}
                                        placeholder="例如：无刷电机接线避坑指南"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">发布日期</label>
                                    <input
                                        type="date"
                                        value={form.publishedAt}
                                        onChange={e => setForm({ ...form, publishedAt: e.target.value })}
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                            </div>

                            {/* 核心数据四件套 */}
                            <div className="grid grid-cols-4 gap-2 text-xs">
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-600">阅读 (小眼睛)</label>
                                    <input
                                        type="number"
                                        value={form.views}
                                        onChange={e => setForm({ ...form, views: Number(e.target.value) })}
                                        className="w-full border rounded-lg p-1.5 bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-600">点赞数</label>
                                    <input
                                        type="number"
                                        value={form.likes}
                                        onChange={e => setForm({ ...form, likes: Number(e.target.value) })}
                                        className="w-full border rounded-lg p-1.5 bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-600">收藏数</label>
                                    <input
                                        type="number"
                                        value={form.collects}
                                        onChange={e => setForm({ ...form, collects: Number(e.target.value) })}
                                        className="w-full border rounded-lg p-1.5 bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-600">评论数</label>
                                    <input
                                        type="number"
                                        value={form.comments}
                                        onChange={e => setForm({ ...form, comments: Number(e.target.value) })}
                                        className="w-full border rounded-lg p-1.5 bg-transparent"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-600">首图/标题点击率研判</label>
                                    <select
                                        value={form.ctrAssessment}
                                        onChange={e => setForm({ ...form, ctrAssessment: e.target.value as any })}
                                        className="w-full border rounded-lg p-2 bg-transparent"
                                    >
                                        <option value="HIGH">高 (封面极其吸睛/标题直击痛点)</option>
                                        <option value="NORMAL">正常</option>
                                        <option value="LOW">偏低 (封面缺乏视觉停留/标题泛化)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1 text-gray-600">正文完播与干货留存研判</label>
                                    <select
                                        value={form.interactionAssessment}
                                        onChange={e => setForm({ ...form, interactionAssessment: e.target.value as any })}
                                        className="w-full border rounded-lg p-2 bg-transparent"
                                    >
                                        <option value="HIGH">高收藏比 (干货满满/读者保存备用)</option>
                                        <option value="NORMAL">正常互动</option>
                                        <option value="LOW">低收藏 (内容浮于表面/缺少硬核细节)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-1 text-emerald-600">验证成功的亮点 (哪张图/哪个点被广泛称赞)</label>
                                <textarea
                                    rows={2}
                                    value={form.whatWorked}
                                    onChange={e => setForm({ ...form, whatWorked: e.target.value })}
                                    placeholder="例如：第2页直接给出的参数表格被大量截图收藏..."
                                    className="w-full border rounded-lg p-2 text-xs bg-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-1 text-rose-600">踩坑或读者卡点 (读者普遍看不懂或吐槽的地方)</label>
                                <textarea
                                    rows={2}
                                    value={form.whatFailed}
                                    onChange={e => setForm({ ...form, whatFailed: e.target.value })}
                                    placeholder="例如：死区时间怎么算没讲清楚，导致有读者自己算错了..."
                                    className="w-full border rounded-lg p-2 text-xs bg-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">读者真实反馈原话 (每行一条)</label>
                                <textarea
                                    rows={2}
                                    value={form.feedbackSignalsText}
                                    onChange={e => setForm({ ...form, feedbackSignalsText: e.target.value })}
                                    placeholder="求出死区时间计算推导！&#10;带光耦隔离的电路图能发一份吗？"
                                    className="w-full border rounded-lg p-2 text-xs bg-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">下一篇改进选题建议 (每行一条，可直接反哺为选题卡)</label>
                                <textarea
                                    rows={2}
                                    value={form.nextActionIdeasText}
                                    onChange={e => setForm({ ...form, nextActionIdeasText: e.target.value })}
                                    placeholder="无刷驱动板死区时间手把手计算与实操示波器调试&#10;双轴云台光耦隔离保护电路精讲"
                                    className="w-full border rounded-lg p-2 text-xs bg-transparent"
                                />
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
                                onClick={handleCreateReview}
                                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                            >
                                保存复盘记录
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
