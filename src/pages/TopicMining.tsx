import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
    Search, Loader2, Flame, Heart, MessageSquare, Star,
    Wand2, ExternalLink, Eye, Clock, Filter, ChevronDown,
    LayoutGrid, LayoutList, BarChart3, Download, FileText
} from 'lucide-react';
import NoteAnalysisModal from '../components/NoteAnalysisModal';

interface SearchResultNote {
    id: number;
    note_id: string;
    title: string;
    cover_url: string;
    author_name: string;
    likes_count: number;
    comments_count: number;
    collects_count: number;
    note_url: string;
    scraped_at: string;
    content: string;
    type: 'video' | 'image';
    search_keyword: string;
    topic_tags?: string[];
    analysis_result?: any;
}

interface SearchKeyword {
    keyword: string;
    count: number;
    last_scraped: string;
}

type SortMode = 'likes' | 'collects' | 'comments' | 'date';
type ViewMode = 'grid' | 'list';

export default function TopicMining() {
    const navigate = useNavigate();

    const [keyword, setKeyword] = useState('');
    const [sort, setSort] = useState<SortMode>('likes');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [notes, setNotes] = useState<SearchResultNote[]>([]);
    const [keywords, setKeywords] = useState<SearchKeyword[]>([]);
    const [selectedKeyword, setSelectedKeyword] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 12, total: 0 });
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);
    const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
    const [currentNote, setCurrentNote] = useState<SearchResultNote | null>(null);
    const [topics, setTopics] = useState<Array<{ name: string; count: number }>>([]);
    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const [classifying, setClassifying] = useState(false);

    const SORT_OPTIONS: { value: SortMode; label: string }[] = [
        { value: 'likes', label: '按点赞排序' },
        { value: 'collects', label: '按收藏排序' },
        { value: 'comments', label: '按评论排序' },
        { value: 'date', label: '按时间排序' },
    ];

    useEffect(() => {
        fetchKeywords();
    }, []);

    useEffect(() => {
        fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedKeyword, selectedTopic, sort, pagination.page]);

    useEffect(() => {
        fetchTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedKeyword]);

    const fetchKeywords = async () => {
        try {
            const res = await axios.get('/api/niche/keywords');
            setKeywords(res.data.data || []);
        } catch (e) {
            console.error('Failed to fetch keywords', e);
        }
    };

    const fetchTopics = async () => {
        try {
            const params: any = {};
            if (selectedKeyword) {
                params.keyword = selectedKeyword;
            }
            const res = await axios.get('/api/niche/topics', { params });
            setTopics(res.data.data || []);
        } catch (e) {
            console.error('Failed to fetch topics', e);
        }
    };

    const fetchNotes = async () => {
        setLoading(true);
        try {
            const params: any = {
                sort,
                page: pagination.page,
                pageSize: pagination.pageSize
            };
            if (selectedKeyword) {
                params.keyword = selectedKeyword;
            }
            if (selectedTopic) {
                params.topic = selectedTopic;
            }
            const res = await axios.get('/api/niche/notes', { params });
            setNotes(res.data.data || []);
            setPagination(prev => ({ ...prev, total: res.data.total || 0 }));
        } catch (e: any) {
            toast.error(e.response?.data?.error || '获取数据失败');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!keyword.trim()) {
            toast.error('请输入搜索关键词');
            return;
        }
        setSearching(true);
        try {
            const res = await axios.post('/api/niche/search', {
                keyword: keyword.trim(),
                sort: 'general',
                limit: 20,
                autoAnalyze: true
            });
            toast.success(`搜索任务已创建: ${res.data.taskId}`);
            setSelectedKeyword(keyword.trim());
            setKeyword('');
            await fetchKeywords();
        } catch (e: any) {
            toast.error(e.response?.data?.error || '创建搜索任务失败');
        } finally {
            setSearching(false);
        }
    };

    const handleClassify = async () => {
        setClassifying(true);
        try {
            const res = await axios.post('/api/niche/classify', {
                keyword: selectedKeyword || undefined
            });
            toast.success(`分类任务已创建: ${res.data.taskId}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error || '创建分类任务失败');
        } finally {
            setClassifying(false);
        }
    };

    const handleExport = async (format: 'markdown' | 'excel') => {
        try {
            const params: any = { format };
            if (selectedKeyword) params.keyword = selectedKeyword;
            if (selectedTopic) params.topic = selectedTopic;

            const res = await axios.get('/api/niche/export', {
                params,
                responseType: format === 'markdown' ? 'blob' : 'json'
            });

            if (format === 'markdown') {
                const blob = new Blob([res.data], { type: 'text/markdown' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `选题挖掘-${selectedKeyword || '全部'}.md`;
                a.click();
                window.URL.revokeObjectURL(url);
                toast.success('Markdown导出成功');
            } else {
                // Excel export via xlsx library
                const XLSX = await import('xlsx');
                const ws = XLSX.utils.json_to_sheet(res.data.data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, '选题挖掘');
                XLSX.writeFile(wb, `选题挖掘-${selectedKeyword || '全部'}.xlsx`);
                toast.success('Excel导出成功');
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || '导出失败');
        }
    };

    const handleAnalyze = async (note: SearchResultNote) => {
        setAnalyzingId(note.note_id);
        try {
            await axios.post('/api/trending-notes/analyze', { noteId: note.note_id });
            toast.success('分析任务已提交，请稍后刷新');
        } catch (e: any) {
            toast.error(e.response?.data?.error || '分析失败');
        } finally {
            setAnalyzingId(null);
        }
    };

    const handleRemix = (note: SearchResultNote) => {
        if (!note.analysis_result) {
            toast.error('该笔记尚未分析，请先进行深度分析');
            return;
        }
        navigate('/generate', {
            state: {
                remixNote: {
                    title: note.title,
                    structure: note.analysis_result,
                    type: note.type
                }
            }
        });
        toast.success(`已引用结构: ${note.title}`);
    };

    const handleOpenNote = (note: SearchResultNote) => {
        window.open(note.note_url, '_blank');
    };

    const handleShowAnalysis = (note: SearchResultNote) => {
        if (!note.analysis_result) {
            toast.error('该笔记尚未分析');
            return;
        }
        setCurrentNote(note);
        setCurrentAnalysis(note.analysis_result);
        setShowAnalysisModal(true);
    };

    const totalPages = Math.ceil(pagination.total / pagination.pageSize);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-gray-900">选题挖掘</h1>
                <p className="text-gray-500">
                    通过关键词搜索小红书内容，发现高流量选题并智能拆解结构。
                </p>
            </div>

            {/* Search Bar */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="输入关键词，例如: 中级会计备考口诀"
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={searching}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center disabled:opacity-60"
                    >
                        {searching ? (
                            <Loader2 size={16} className="mr-2 animate-spin" />
                        ) : (
                            <Search size={16} className="mr-2" />
                        )}
                        搜索
                    </button>
                </div>

                {/* Search History */}
                {keywords.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <span className="text-xs text-gray-400 py-1">搜索历史:</span>
                        {keywords.map((k) => (
                            <button
                                key={k.keyword}
                                onClick={() => {
                                    setSelectedKeyword(k.keyword);
                                    setPagination(prev => ({ ...prev, page: 1 }));
                                }}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                    selectedKeyword === k.keyword
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                {k.keyword}
                                <span className="ml-1 text-gray-400">({k.count})</span>
                            </button>
                        ))}
                        {selectedKeyword && (
                            <button
                                onClick={() => {
                                    setSelectedKeyword('');
                                    setSelectedTopic('');
                                    setPagination(prev => ({ ...prev, page: 1 }));
                                }}
                                className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                            >
                                清除筛选
                            </button>
                        )}
                    </div>
                )}

                {/* Topic Tags Filter */}
                {selectedKeyword && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400 py-1">子主题:</span>
                            {topics.length === 0 ? (
                                <button
                                    onClick={handleClassify}
                                    disabled={classifying}
                                    className="text-xs px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 flex items-center"
                                >
                                    {classifying ? (
                                        <Loader2 size={12} className="mr-1 animate-spin" />
                                    ) : (
                                        <Filter size={12} className="mr-1" />
                                    )}
                                    AI自动分类
                                </button>
                            ) : (
                                <>
                                    {topics.map((t) => (
                                        <button
                                            key={t.name}
                                            onClick={() => {
                                                setSelectedTopic(selectedTopic === t.name ? '' : t.name);
                                                setPagination(prev => ({ ...prev, page: 1 }));
                                            }}
                                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                                selectedTopic === t.name
                                                    ? 'bg-green-50 border-green-200 text-green-700'
                                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                            }`}
                                        >
                                            {t.name}
                                            <span className="ml-1 text-gray-400">({t.count})</span>
                                        </button>
                                    ))}
                                    <button
                                        onClick={handleClassify}
                                        disabled={classifying}
                                        className="text-xs px-2 py-1 text-indigo-600 hover:bg-indigo-50 rounded-full border border-indigo-200 disabled:opacity-50"
                                    >
                                        {classifying ? <Loader2 size={12} className="animate-spin" /> : '重新分类'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                        共 {pagination.total} 条结果
                        {selectedKeyword && (
                            <span className="ml-1 text-indigo-600">「{selectedKeyword}」</span>
                        )}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Sort Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                        >
                            <Filter size={14} />
                            {SORT_OPTIONS.find(o => o.value === sort)?.label}
                            <ChevronDown size={14} />
                        </button>
                        {showSortDropdown && (
                            <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                                {SORT_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            setSort(option.value);
                                            setShowSortDropdown(false);
                                            setPagination(prev => ({ ...prev, page: 1 }));
                                        }}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                                            sort === option.value ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Export Button */}
                    {notes.length > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => handleExport('markdown')}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                                title="导出Markdown"
                            >
                                <FileText size={14} />
                                导出
                            </button>
                        </div>
                    )}

                    {/* View Mode Toggle */}
                    <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 ${viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 ${viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <LayoutList size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Notes Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-indigo-600" />
                </div>
            ) : notes.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 py-20 text-center">
                    <Search size={48} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-1">暂无数据</h3>
                    <p className="text-sm text-gray-500">
                        {selectedKeyword
                            ? `未找到关键词 "${selectedKeyword}" 的搜索结果`
                            : '请输入关键词进行搜索，或选择历史关键词查看结果'}
                    </p>
                </div>
            ) : (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                    : 'space-y-3'
                }>
                    {notes.map((note) => (
                        <div
                            key={note.id}
                            className={`bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow ${
                                viewMode === 'list' ? 'flex gap-4 p-4' : ''
                            }`}
                        >
                            {/* Cover */}
                            <div className={`relative ${viewMode === 'list' ? 'w-32 h-24 flex-shrink-0' : 'aspect-[4/3]'}`}>
                                {note.cover_url ? (
                                    <img
                                        src={note.cover_url}
                                        alt={note.title}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                        <span className="text-xs text-gray-400">无封面</span>
                                    </div>
                                )}
                                {note.type === 'video' && (
                                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                                        视频
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className={`${viewMode === 'list' ? 'flex-1 min-w-0' : 'p-3'}`}>
                                <h3
                                    className="text-sm font-medium text-gray-900 line-clamp-2 mb-2 cursor-pointer hover:text-indigo-600"
                                    onClick={() => handleOpenNote(note)}
                                >
                                    {note.title}
                                </h3>

                                {note.topic_tags && note.topic_tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {note.topic_tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                                    <span className="flex items-center gap-1">
                                        <Heart size={12} className="text-red-400" />
                                        {note.likes_count > 0 ? note.likes_count.toLocaleString() : '-'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Star size={12} className="text-yellow-400" />
                                        {note.collects_count > 0 ? note.collects_count.toLocaleString() : '-'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <MessageSquare size={12} className="text-blue-400" />
                                        {note.comments_count > 0 ? note.comments_count.toLocaleString() : '-'}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400 truncate max-w-[120px]">
                                        {note.author_name}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        {note.analysis_result ? (
                                            <>
                                                <button
                                                    onClick={() => handleShowAnalysis(note)}
                                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                                    title="查看结构拆解"
                                                >
                                                    <BarChart3 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleRemix(note)}
                                                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                    title="一键仿写"
                                                >
                                                    <Wand2 size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleAnalyze(note)}
                                                disabled={analyzingId === note.note_id}
                                                className="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                {analyzingId === note.note_id ? (
                                                    <Loader2 size={12} className="animate-spin inline mr-1" />
                                                ) : null}
                                                分析
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleOpenNote(note)}
                                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
                                            title="打开原文"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={pagination.page === 1}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                    >
                        上一页
                    </button>
                    <span className="text-sm text-gray-600">
                        {pagination.page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                        disabled={pagination.page >= totalPages}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                    >
                        下一页
                    </button>
                </div>
            )}

            {/* Analysis Modal */}
            {showAnalysisModal && currentAnalysis && currentNote && (
                <NoteAnalysisModal
                    note={currentNote}
                    analysis={currentAnalysis}
                    onClose={() => {
                        setShowAnalysisModal(false);
                        setCurrentAnalysis(null);
                        setCurrentNote(null);
                    }}
                    onSelect={(note) => {
                        handleRemix(note);
                    }}
                />
            )}
        </div>
    );
}
