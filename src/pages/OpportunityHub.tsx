import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { useAccount } from '@/context/AccountContext';
import { Lightbulb, Plus, CheckCircle2, Clock, XCircle, FileText, ChevronRight, MessageSquare, AlertCircle, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ResearchEvidence {
    id: string;
    sourceType: string;
    sourceUrl?: string;
    rawText: string;
    painPoints?: string[];
    desires?: string[];
    authorNickname?: string;
    createdAt: string;
}

interface ContentOpportunity {
    id: string;
    title: string;
    targetAudience: string;
    scenario: string;
    problem: string;
    uniqueAngle: string;
    contentFormat: string;
    expectedOutcome: string;
    contentPillar?: string;
    status: 'IDEA' | 'ACCEPTED' | 'DEFERRED' | 'REJECTED';
    decisionReason?: string;
    evidence?: ResearchEvidence[];
    createdAt: string;
}

export default function OpportunityHub() {
    const { activeAccount } = useAccount();
    const [tab, setTab] = useState<'opportunities' | 'evidence'>('opportunities');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    // 列表状态
    const [opportunities, setOpportunities] = useState<ContentOpportunity[]>([]);
    const [evidenceList, setEvidenceList] = useState<ResearchEvidence[]>([]);
    const [loading, setLoading] = useState(false);

    // 新增证据弹窗
    const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
    const [evidenceForm, setEvidenceForm] = useState({
        sourceType: 'COMMENT',
        sourceUrl: '',
        rawText: '',
        painPoints: '',
        desires: '',
        authorNickname: ''
    });

    // 新增机会卡弹窗
    const [isOppModalOpen, setIsOppModalOpen] = useState(false);
    const [oppForm, setOppForm] = useState({
        title: '',
        targetAudience: '',
        scenario: '',
        problem: '',
        uniqueAngle: '',
        contentFormat: 'TUTORIAL',
        expectedOutcome: 'TRUST',
        contentPillar: '',
        selectedEvidenceIds: [] as string[]
    });

    // Brief 弹窗状态
    const [briefModalOpen, setBriefModalOpen] = useState(false);
    const [activeBrief, setActiveBrief] = useState<string>('');
    const [copied, setCopied] = useState(false);

    // 决策弹窗状态
    const [decideModalOpen, setDecideModalOpen] = useState(false);
    const [currentDecideOpp, setCurrentDecideOpp] = useState<ContentOpportunity | null>(null);
    const [decisionStatus, setDecisionStatus] = useState<'ACCEPTED' | 'DEFERRED' | 'REJECTED'>('ACCEPTED');
    const [decisionReason, setDecisionReason] = useState('');

    const accountId = activeAccount?.id;

    useEffect(() => {
        if (!accountId) return;
        loadData();
    }, [accountId, tab, statusFilter]);

    const loadData = async () => {
        if (!accountId) return;
        setLoading(true);
        try {
            if (tab === 'opportunities') {
                const url = statusFilter === 'ALL'
                    ? `/api/research/opportunities?accountId=${accountId}`
                    : `/api/research/opportunities?accountId=${accountId}&status=${statusFilter}`;
                const res = await axios.get(url);
                setOpportunities(res.data);
            } else {
                const res = await axios.get(`/api/research/evidence?accountId=${accountId}`);
                setEvidenceList(res.data);
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || '加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateEvidence = async () => {
        if (!accountId) return toast.error('请先选择账号');
        if (!evidenceForm.rawText.trim()) return toast.error('请填写证据原话');

        try {
            await axios.post('/api/research/evidence', {
                accountId,
                sourceType: evidenceForm.sourceType,
                sourceUrl: evidenceForm.sourceUrl,
                rawText: evidenceForm.rawText,
                painPoints: evidenceForm.painPoints ? evidenceForm.painPoints.split(/[,，\n]/).map(s => s.trim()).filter(Boolean) : [],
                desires: evidenceForm.desires ? evidenceForm.desires.split(/[,，\n]/).map(s => s.trim()).filter(Boolean) : [],
                authorNickname: evidenceForm.authorNickname
            });
            toast.success('研究证据已固化录入');
            setIsEvidenceModalOpen(false);
            setEvidenceForm({
                sourceType: 'COMMENT',
                sourceUrl: '',
                rawText: '',
                painPoints: '',
                desires: '',
                authorNickname: ''
            });
            loadData();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '录入失败');
        }
    };

    const handleCreateOpportunity = async () => {
        if (!accountId) return toast.error('请先选择账号');
        if (!oppForm.title || !oppForm.targetAudience || !oppForm.problem) {
            return toast.error('请补齐核心选题三要素（标题、受众、解决的核心问题）');
        }

        try {
            await axios.post('/api/research/opportunities', {
                accountId,
                ...oppForm,
                evidenceIds: oppForm.selectedEvidenceIds
            });
            toast.success('内容机会卡创建成功');
            setIsOppModalOpen(false);
            setOppForm({
                title: '',
                targetAudience: '',
                scenario: '',
                problem: '',
                uniqueAngle: '',
                contentFormat: 'TUTORIAL',
                expectedOutcome: 'TRUST',
                contentPillar: '',
                selectedEvidenceIds: []
            });
            loadData();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '创建机会卡失败');
        }
    };

    const openDecideModal = (opp: ContentOpportunity) => {
        setCurrentDecideOpp(opp);
        setDecisionStatus(opp.status === 'IDEA' ? 'ACCEPTED' : opp.status);
        setDecisionReason(opp.decisionReason || '');
        setDecideModalOpen(true);
    };

    const handleSaveDecision = async () => {
        if (!currentDecideOpp) return;
        try {
            await axios.put(`/api/research/opportunities/${currentDecideOpp.id}/decide`, {
                status: decisionStatus,
                decisionReason
            });
            toast.success('决策已记录');
            setDecideModalOpen(false);
            loadData();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '保存决策失败');
        }
    };

    const handleViewBrief = async (oppId: string) => {
        try {
            const res = await axios.get(`/api/research/opportunities/${oppId}/brief`);
            setActiveBrief(res.data.brief);
            setBriefModalOpen(true);
            setCopied(false);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '获取 Brief 失败');
        }
    };

    const handleCopyBrief = () => {
        navigator.clipboard.writeText(activeBrief);
        setCopied(true);
        toast.success('Brief 已复制到剪贴板');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Lightbulb className="w-6 h-6 text-yellow-500" />
                        选题机会池 (P1.2 Content Opportunities)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        拒绝对着空白输入框凭空捏造。把真实的用户原话、评论痛点、客诉转化为有理有据的内容机会卡。
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={async () => {
                            if (!accountId) return toast.error('请先选择账号');
                            try {
                                const res = await axios.get(`/api/research/evidence?accountId=${accountId}`);
                                setEvidenceList(res.data);
                            } catch (_) {}
                            setIsOppModalOpen(true);
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        新建机会卡
                    </button>
                    <button
                        onClick={() => setIsEvidenceModalOpen(true)}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium flex items-center gap-1.5 transition-colors border"
                    >
                        <FileText className="w-4 h-4" />
                        录入真实证据
                    </button>
                </div>
            </div>

            {/* Account warning if not selected */}
            {!activeAccount && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-3 text-yellow-800 dark:text-yellow-200 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>请在左上角选择要操作的目标账号，以关联对应的专属经营档案与选题机会池。</span>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-1">
                    <button
                        onClick={() => setTab('opportunities')}
                        className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${
                            tab === 'opportunities'
                                ? 'border-red-600 text-red-600 dark:text-red-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        内容机会卡 ({opportunities.length})
                    </button>
                    <button
                        onClick={() => setTab('evidence')}
                        className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${
                            tab === 'evidence'
                                ? 'border-red-600 text-red-600 dark:text-red-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        研究证据库
                    </button>
                </div>

                {tab === 'opportunities' && (
                    <div className="flex items-center gap-1 text-xs">
                        <span className="text-gray-500 mr-1">决策状态:</span>
                        {(['ALL', 'IDEA', 'ACCEPTED', 'DEFERRED', 'REJECTED'] as const).map(st => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                className={`px-2.5 py-1 rounded transition-colors ${
                                    statusFilter === st
                                        ? 'bg-red-600 text-white font-medium'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                                }`}
                            >
                                {st === 'ALL' ? '全部' : st === 'IDEA' ? '待决策' : st === 'ACCEPTED' ? '已采纳' : st === 'DEFERRED' ? '暂缓' : '舍弃'}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Content Display */}
            {loading ? (
                <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
            ) : tab === 'opportunities' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {opportunities.length === 0 ? (
                        <div className="col-span-full py-16 text-center border-2 border-dashed rounded-xl border-gray-200 dark:border-gray-800">
                            <Lightbulb className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">当前没有选题机会卡</p>
                            <p className="text-xs text-gray-400 mt-1">从用户真实痛点、高频评论中提取机会，建立有把握的选题储备</p>
                        </div>
                    ) : (
                        opportunities.map(opp => (
                            <div
                                key={opp.id}
                                className="bg-white dark:bg-gray-900 border rounded-xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative"
                            >
                                <div>
                                    {/* Badges */}
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                            opp.status === 'ACCEPTED'
                                                ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300 border border-green-200'
                                                : opp.status === 'DEFERRED'
                                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300 border border-yellow-200'
                                                : opp.status === 'REJECTED'
                                                ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200'
                                        }`}>
                                            {opp.status === 'IDEA' ? '待决策' : opp.status === 'ACCEPTED' ? '已采纳制作' : opp.status === 'DEFERRED' ? '暂缓储备' : '已舍弃'}
                                        </span>
                                        {opp.contentPillar && (
                                            <span className="text-[11px] bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 px-2 py-0.5 rounded border border-purple-100">
                                                {opp.contentPillar}
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="font-bold text-base leading-snug mb-2 line-clamp-2">{opp.title}</h3>

                                    <div className="text-xs space-y-1.5 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border mb-3">
                                        <div><span className="font-semibold text-gray-700 dark:text-gray-200">目标受众：</span>{opp.targetAudience}</div>
                                        <div><span className="font-semibold text-gray-700 dark:text-gray-200">场景：</span>{opp.scenario}</div>
                                        <div className="line-clamp-2"><span className="font-semibold text-gray-700 dark:text-gray-200">解决问题：</span>{opp.problem}</div>
                                        <div className="line-clamp-2 text-red-600 dark:text-red-400"><span className="font-semibold">切入角度：</span>{opp.uniqueAngle}</div>
                                    </div>

                                    {/* Evidence references */}
                                    {opp.evidence && opp.evidence.length > 0 && (
                                        <div className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                                            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                                            <span>关联 {opp.evidence.length} 条真实依据原话</span>
                                        </div>
                                    )}

                                    {opp.decisionReason && (
                                        <div className="text-xs italic text-gray-400 mb-3">
                                            决策依据: {opp.decisionReason}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-between pt-3 border-t text-xs">
                                    <button
                                        onClick={() => openDecideModal(opp)}
                                        className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
                                    >
                                        调整决策
                                    </button>
                                    <button
                                        onClick={() => handleViewBrief(opp.id)}
                                        className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-0.5"
                                    >
                                        导出创作 Brief <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {evidenceList.length === 0 ? (
                        <div className="py-16 text-center border-2 border-dashed rounded-xl border-gray-200 dark:border-gray-800">
                            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">暂无研究证据</p>
                            <p className="text-xs text-gray-400 mt-1">录入评论、私信痛点、竞品高频吐槽，作为内容创新的第一手凭证</p>
                        </div>
                    ) : (
                        evidenceList.map(ev => (
                            <div key={ev.id} className="bg-white dark:bg-gray-900 border rounded-lg p-4 text-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="space-y-1 max-w-3xl">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border">
                                            {ev.sourceType}
                                        </span>
                                        {ev.authorNickname && (
                                            <span className="text-xs text-gray-500 font-medium">@{ev.authorNickname}</span>
                                        )}
                                        <span className="text-[11px] text-gray-400">{ev.createdAt?.slice(0, 10)}</span>
                                    </div>
                                    <p className="text-gray-800 dark:text-gray-200 font-medium">“{ev.rawText}”</p>
                                    {ev.painPoints && ev.painPoints.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {ev.painPoints.map((p, idx) => (
                                                <span key={idx} className="text-[10px] bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                                                    痛点: {p}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {ev.sourceUrl && (
                                    <a
                                        href={ev.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-blue-500 hover:underline flex-shrink-0 self-start md:self-center"
                                    >
                                        查看来源链接
                                    </a>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Modal: 新建真实证据 */}
            {isEvidenceModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-lg w-full p-6 space-y-4 border shadow-xl">
                        <h2 className="text-lg font-bold">录入研究证据（用户原话与痛点）</h2>
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">证据来源</label>
                                <select
                                    value={evidenceForm.sourceType}
                                    onChange={e => setEvidenceForm({ ...evidenceForm, sourceType: e.target.value })}
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                >
                                    <option value="COMMENT">笔记评论区</option>
                                    <option value="DM">私信咨询 / 客服</option>
                                    <option value="NOTE">竞品笔记正文</option>
                                    <option value="MANUAL">创作者现场访谈 / 观察</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">用户原话 (必须如实记录，不加美化) *</label>
                                <textarea
                                    rows={3}
                                    value={evidenceForm.rawText}
                                    onChange={e => setEvidenceForm({ ...evidenceForm, rawText: e.target.value })}
                                    placeholder="例如：刚买的无刷电机一通电就发烫失步，换了三块驱动板都是这样，求解答..."
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">提取痛点标签（逗号分隔）</label>
                                <input
                                    type="text"
                                    value={evidenceForm.painPoints}
                                    onChange={e => setEvidenceForm({ ...evidenceForm, painPoints: e.target.value })}
                                    placeholder="电机发热, 驱动板烧毁, 调试失步"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">发言人 / 昵称 (可选)</label>
                                <input
                                    type="text"
                                    value={evidenceForm.authorNickname}
                                    onChange={e => setEvidenceForm({ ...evidenceForm, authorNickname: e.target.value })}
                                    placeholder="例如：小红薯668"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">来源 URL (可选)</label>
                                <input
                                    type="text"
                                    value={evidenceForm.sourceUrl}
                                    onChange={e => setEvidenceForm({ ...evidenceForm, sourceUrl: e.target.value })}
                                    placeholder="https://www.xiaohongshu.com/discovery/item/..."
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button
                                onClick={() => setIsEvidenceModalOpen(false)}
                                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateEvidence}
                                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                固化保存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: 新建内容机会卡 */}
            {isOppModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-xl w-full p-6 space-y-4 border shadow-xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-lg font-bold">创建内容机会卡 (选题决策卡)</h2>
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">选题暂定标题 *</label>
                                <input
                                    type="text"
                                    value={oppForm.title}
                                    onChange={e => setOppForm({ ...oppForm, title: e.target.value })}
                                    placeholder="例如：3分钟搞懂无刷云台抗日光调试与防失步"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">目标读者 *</label>
                                    <input
                                        type="text"
                                        value={oppForm.targetAudience}
                                        onChange={e => setOppForm({ ...oppForm, targetAudience: e.target.value })}
                                        placeholder="例如：电赛备赛生、机器人初学者"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">遇到场景 *</label>
                                    <input
                                        type="text"
                                        value={oppForm.scenario}
                                        onChange={e => setOppForm({ ...oppForm, scenario: e.target.value })}
                                        placeholder="例如：强光户外调参阶段"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">解决的核心痛点 / 认知误区 *</label>
                                <textarea
                                    rows={2}
                                    value={oppForm.problem}
                                    onChange={e => setOppForm({ ...oppForm, problem: e.target.value })}
                                    placeholder="例如：误以为调高电流就能不失步，导致电机过热发烫烧管"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">独特性切入点 / 为什么看你 *</label>
                                <textarea
                                    rows={2}
                                    value={oppForm.uniqueAngle}
                                    onChange={e => setOppForm({ ...oppForm, uniqueAngle: e.target.value })}
                                    placeholder="例如：给出示波器电流波形对比与实测散热温升数据"
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">呈现体裁</label>
                                    <select
                                        value={oppForm.contentFormat}
                                        onChange={e => setOppForm({ ...oppForm, contentFormat: e.target.value })}
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    >
                                        <option value="TUTORIAL">教程指南图文</option>
                                        <option value="CHECKLIST">检查清单 / 避坑卡</option>
                                        <option value="CASE_STUDY">案例实操拆解</option>
                                        <option value="COMPARISON">对比评测</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">预期交付结果</label>
                                    <select
                                        value={oppForm.expectedOutcome}
                                        onChange={e => setOppForm({ ...oppForm, expectedOutcome: e.target.value })}
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    >
                                        <option value="TRUST">专业信任建立</option>
                                        <option value="CONVERSION">直接转化 / 咨询</option>
                                        <option value="AWARENESS">破圈曝光</option>
                                        <option value="INTERACTION">评论互动讨论</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600">归属栏目 (可选)</label>
                                    <input
                                        type="text"
                                        value={oppForm.contentPillar}
                                        onChange={e => setOppForm({ ...oppForm, contentPillar: e.target.value })}
                                        placeholder="例如：硬件避坑"
                                        className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                    />
                                </div>
                            </div>

                            {/* 勾选关联证据 */}
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">关联真实依据 (勾选以支撑该选题)</label>
                                <div className="max-h-36 overflow-y-auto border rounded-lg p-2 space-y-1.5 text-xs">
                                    {evidenceList.length === 0 ? (
                                        <div className="text-gray-400 py-2 text-center">暂无可勾选证据，可先直接创建</div>
                                    ) : (
                                        evidenceList.map(ev => (
                                            <label key={ev.id} className="flex items-start gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={oppForm.selectedEvidenceIds.includes(ev.id)}
                                                    onChange={e => {
                                                        const id = ev.id;
                                                        if (e.target.checked) {
                                                            setOppForm({ ...oppForm, selectedEvidenceIds: [...oppForm.selectedEvidenceIds, id] });
                                                        } else {
                                                            setOppForm({ ...oppForm, selectedEvidenceIds: oppForm.selectedEvidenceIds.filter(x => x !== id) });
                                                        }
                                                    }}
                                                    className="mt-0.5 rounded text-red-600"
                                                />
                                                <span className="line-clamp-2 text-gray-700 dark:text-gray-300">
                                                    [{ev.sourceType}] {ev.rawText}
                                                </span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button
                                onClick={() => setIsOppModalOpen(false)}
                                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateOpportunity}
                                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                生成机会卡
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: 决策弹窗 */}
            {decideModalOpen && currentDecideOpp && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6 space-y-4 border shadow-xl">
                        <h2 className="text-lg font-bold">选题决策：{currentDecideOpp.title}</h2>
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">决策动作</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDecisionStatus('ACCEPTED')}
                                        className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                                            decisionStatus === 'ACCEPTED'
                                                ? 'bg-green-600 text-white border-green-600'
                                                : 'border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        采纳并准备制作
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDecisionStatus('DEFERRED')}
                                        className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                                            decisionStatus === 'DEFERRED'
                                                ? 'bg-yellow-500 text-white border-yellow-500'
                                                : 'border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        暂缓至储备池
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDecisionStatus('REJECTED')}
                                        className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                                            decisionStatus === 'REJECTED'
                                                ? 'bg-gray-700 text-white border-gray-700'
                                                : 'border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        舍弃该选题
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600">决策依据或备忘 (为什么这样决定)</label>
                                <textarea
                                    rows={3}
                                    value={decisionReason}
                                    onChange={e => setDecisionReason(e.target.value)}
                                    placeholder="例如：当前账号粉丝更关心调参，硬件避坑延后到下周发布..."
                                    className="w-full border rounded-lg p-2 text-sm bg-transparent"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button
                                onClick={() => setDecideModalOpen(false)}
                                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveDecision}
                                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                保存决策
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: 导出创作 Brief */}
            {briefModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full p-6 space-y-4 border shadow-xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">结构化创作 Brief (可直接用于 AI 撰写或人工创作)</h2>
                            <button
                                onClick={handleCopyBrief}
                                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-red-700"
                            >
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? '已复制' : '一键复制'}
                            </button>
                        </div>
                        <pre className="p-4 bg-gray-50 dark:bg-gray-950 border rounded-lg text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto leading-relaxed">
                            {activeBrief}
                        </pre>
                        <div className="flex justify-end pt-2 border-t">
                            <button
                                onClick={() => setBriefModalOpen(false)}
                                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-100"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
