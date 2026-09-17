import React, { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { useAccount } from '@/context/AccountContext';
import { Network, Sparkles, Copy, Check, FileText, Video, Send, Terminal, AlertCircle, ArrowRight, Play } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface ContentPackage {
    id: string;
    accountId: number;
    title: string;
    targetAudience?: string;
    coreValueProposition?: string;
    keyPoints: string[];
    bodyMarkdown: string;
    tags: string[];
    currentVersion: number;
}

interface VideoScriptScene {
    sceneNumber: number;
    visualDescription: string;
    narration: string;
    audioCue?: string;
    durationSeconds: number;
}

interface DerivedContent {
    packageId: string;
    platform: 'WECHAT_ARTICLE' | 'VIDEO_SCRIPT' | 'WEIBO_POST';
    title: string;
    content: string;
    scenes?: VideoScriptScene[];
    estimatedDurationSeconds?: number;
    tags: string[];
}

export default function WorkflowStudio() {
    const { activeAccount } = useAccount();
    const accountId = activeAccount?.id;
    const navigate = useNavigate();

    const [packages, setPackages] = useState<ContentPackage[]>([]);
    const [selectedPackageId, setSelectedPackageId] = useState<string>('');
    const [targetPlatform, setTargetPlatform] = useState<'WECHAT_ARTICLE' | 'VIDEO_SCRIPT' | 'WEIBO_POST'>('WECHAT_ARTICLE');

    const [derived, setDerived] = useState<DerivedContent | null>(null);
    const [deriving, setDeriving] = useState(false);
    const [converting, setConverting] = useState(false);
    const [copied, setCopied] = useState(false);

    // MCP tab
    const [activeTab, setActiveTab] = useState<'derivation' | 'mcp'>('derivation');
    const [mcpTools, setMcpTools] = useState<any[]>([]);

    useEffect(() => {
        if (!accountId) return;
        loadPackages();
        loadMcpTools();
    }, [accountId]);

    const loadPackages = async () => {
        try {
            const res = await axios.get(`/api/packages?accountId=${accountId}`);
            setPackages(res.data);
            if (res.data.length > 0 && !selectedPackageId) {
                setSelectedPackageId(res.data[0].id);
            }
        } catch (e: any) {
            toast.error('加载内容包列表失败');
        }
    };

    const loadMcpTools = async () => {
        try {
            const res = await axios.get('/api/workflows/mcp/tools');
            setMcpTools(res.data.tools || []);
        } catch (_) {}
    };

    const handleDerive = async () => {
        if (!selectedPackageId) return toast.error('请选择一个源内容包');
        setDeriving(true);
        try {
            const res = await axios.post('/api/workflows/derive', {
                packageId: selectedPackageId,
                targetPlatform
            });
            setDerived(res.data.derived);
            toast.success('跨平台派生成功');
            setCopied(false);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '派生失败');
        } finally {
            setDeriving(false);
        }
    };

    const handleCopy = () => {
        if (!derived) return;
        navigator.clipboard.writeText(derived.content);
        setCopied(true);
        toast.success('已复制到剪贴板');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleConvertToVideoProject = async () => {
        if (!selectedPackageId) return;
        setConverting(true);
        try {
            const res = await axios.post('/api/workflows/convert-to-video-project', {
                packageId: selectedPackageId
            });
            toast.success('视频工程已创建，正在进入视频工坊...');
            navigate(`/video-studio/${res.data.project.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '转换视频工程失败');
        } finally {
            setConverting(false);
        }
    };

    const selectedPkg = packages.find(p => p.id === selectedPackageId);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Network className="w-6 h-6 text-violet-600" />
                        工作流与多端派生 (P3.3 Workflow & MCP)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        一次创作，全网分发。将打磨好的小红书核心内容包一键派生为公众号长文、短视频分镜脚本与微博短文。
                    </p>
                </div>
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
                    onClick={() => setActiveTab('derivation')}
                    className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                        activeTab === 'derivation'
                            ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Sparkles size={14} />
                    跨端派生工坊
                </button>
                <button
                    onClick={() => setActiveTab('mcp')}
                    className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                        activeTab === 'mcp'
                            ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Terminal size={14} />
                    MCP 开放能力与协议 ({mcpTools.length})
                </button>
            </div>

            {activeTab === 'derivation' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* 左侧：选择源内容包与目标形态 (4 cols) */}
                    <div className="lg:col-span-4 bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm space-y-4">
                        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">1. 选择源内容包</h2>

                        {packages.length === 0 ? (
                            <div className="text-xs text-gray-400 py-6 text-center border-2 border-dashed rounded-lg">
                                暂无已固化的内容包，请先在【内容包工作台】创建
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {packages.map(pkg => (
                                    <div
                                        key={pkg.id}
                                        onClick={() => {
                                            setSelectedPackageId(pkg.id);
                                            setDerived(null);
                                        }}
                                        className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                                            pkg.id === selectedPackageId
                                                ? 'border-violet-600 bg-violet-50/50 dark:bg-violet-950/30'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between font-bold mb-1">
                                            <span className="line-clamp-1">{pkg.title}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                                                v{pkg.currentVersion}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 line-clamp-2">
                                            {pkg.coreValueProposition || '包含 ' + pkg.keyPoints.length + ' 个核心论点'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 pt-2 border-t">
                            2. 选择派生目标形态
                        </h2>

                        <div className="grid grid-cols-1 gap-2 text-xs">
                            <button
                                type="button"
                                onClick={() => setTargetPlatform('WECHAT_ARTICLE')}
                                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                                    targetPlatform === 'WECHAT_ARTICLE'
                                        ? 'border-violet-600 bg-violet-50/50 dark:bg-violet-950/30 font-semibold'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                            >
                                <FileText className="w-4 h-4 text-emerald-600 mt-0.5" />
                                <div>
                                    <div className="text-xs font-bold text-gray-900 dark:text-gray-100">微信公众号长文</div>
                                    <div className="text-[11px] text-gray-500">导读金句 + 多级分段深度论述 + 关注引流</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setTargetPlatform('VIDEO_SCRIPT')}
                                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                                    targetPlatform === 'VIDEO_SCRIPT'
                                        ? 'border-violet-600 bg-violet-50/50 dark:bg-violet-950/30 font-semibold'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                            >
                                <Video className="w-4 h-4 text-purple-600 mt-0.5" />
                                <div>
                                    <div className="text-xs font-bold text-gray-900 dark:text-gray-100">短视频分镜脚本</div>
                                    <div className="text-[11px] text-gray-500">画面提示 + 口播台词 + 音效提示 + 时长预估</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setTargetPlatform('WEIBO_POST')}
                                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                                    targetPlatform === 'WEIBO_POST'
                                        ? 'border-violet-600 bg-violet-50/50 dark:bg-violet-950/30 font-semibold'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                            >
                                <Send className="w-4 h-4 text-amber-600 mt-0.5" />
                                <div>
                                    <div className="text-xs font-bold text-gray-900 dark:text-gray-100">微博 / 即刻短动态</div>
                                    <div className="text-[11px] text-gray-500">痛点先行 + 精炼要点速览 + 话题聚合</div>
                                </div>
                            </button>
                        </div>

                        <button
                            onClick={handleDerive}
                            disabled={deriving || !selectedPackageId}
                            className="w-full py-2.5 bg-violet-600 text-white rounded-lg font-bold text-xs hover:bg-violet-700 flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                        >
                            <Sparkles className="w-4 h-4" />
                            {deriving ? '智能派生转化中...' : '一键跨平台派生'}
                        </button>
                    </div>

                    {/* 右侧：派生成品展示区 (8 cols) */}
                    <div className="lg:col-span-8 bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b pb-3">
                            <div>
                                <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">
                                    {derived ? derived.title : '跨平台派生成品预览'}
                                </h3>
                                {derived?.estimatedDurationSeconds && (
                                    <span className="text-[11px] text-purple-600 font-bold mt-0.5 block">
                                        预估口播时长: 约 {derived.estimatedDurationSeconds} 秒
                                    </span>
                                )}
                            </div>
                            {derived && (
                                <div className="flex items-center gap-2">
                                    {derived.platform === 'VIDEO_SCRIPT' && (
                                        <button
                                            onClick={handleConvertToVideoProject}
                                            disabled={converting}
                                            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50"
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                            {converting ? '正在创建工程...' : '一键转为视频工程 (进入工坊)'}
                                        </button>
                                    )}
                                    <button
                                        onClick={handleCopy}
                                        className="px-3 py-1.5 bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-violet-100 transition-colors"
                                    >
                                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? '已复制' : '复制文案'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {derived ? (
                            derived.scenes ? (
                                /* 分镜脚本瀑布流 */
                                <div className="space-y-3">
                                    {derived.scenes.map(s => (
                                        <div
                                            key={s.sceneNumber}
                                            className="p-3.5 rounded-xl border bg-gray-50/50 dark:bg-gray-800/40 text-xs space-y-2"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                                                    分镜 0{s.sceneNumber} ({s.durationSeconds}秒)
                                                </span>
                                                <span className="text-[10px] text-gray-400">
                                                    音效: {s.audioCue || '常规BGM'}
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                <div>
                                                    <span className="font-bold text-gray-700 dark:text-gray-300">【画面指示】</span>
                                                    <span className="text-gray-600 dark:text-gray-400">{s.visualDescription}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-gray-700 dark:text-gray-300">【口播台词】</span>
                                                    <span className="text-gray-800 dark:text-gray-200 font-medium">{s.narration}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* 长图文/微博纯文本排版 */
                                <pre className="p-4 bg-gray-50 dark:bg-gray-950 rounded-xl text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[65vh] overflow-y-auto border">
                                    {derived.content}
                                </pre>
                            )
                        ) : (
                            <div className="py-24 text-center text-xs text-gray-400 border-2 border-dashed rounded-xl">
                                在左侧选择一个小红书内容包并选择目标平台，点击【一键跨平台派生】查看成果
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* MCP 协议与声明展示 */
                <div className="bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div>
                            <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                <Terminal className="w-5 h-5 text-violet-600" />
                                Model Context Protocol (MCP) 开放能力集
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                遵循 Anthropic / Hermes 标准 MCP 规范，可供任何外部 AI Agent 调取赤兔创作者操作系统的能力。
                            </p>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-bold">
                            JSON-RPC 2.0 就绪
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {mcpTools.map((t: any) => (
                            <div key={t.name} className="p-4 rounded-xl border bg-gray-50/50 dark:bg-gray-800/40 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                    <code className="font-bold text-violet-600 dark:text-violet-400 font-mono">
                                        {t.name}
                                    </code>
                                    <span className="text-[10px] text-gray-400">Tool</span>
                                </div>
                                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                                    {t.description}
                                </p>
                                <div className="text-[10px] text-gray-400 font-mono pt-2 border-t">
                                    必填参数: [{t.parameters?.required?.join(', ')}]
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
