import axios from '@/lib/axios';
import { Trash2, Edit, FileText, AlertCircle, Send, Clock, Search, X, FileText as FileTextIcon, BookOpen } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import PageLoading from '../components/PageLoading';
import EmptyState from '../components/EmptyState';
import { useState, useEffect, useMemo, useRef } from "react";

interface Draft {
  id: number;
  title: string;
  content: string;
  tags: string[];
  images?: string[];
  created_at: string;
  content_type?: 'note' | 'article' | string;
}

export default function Drafts() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [currentDraft, setCurrentDraft] = useState<Draft | null>(null);
  const [scheduledTime, setScheduledTime] = useState('');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'note' | 'article'>('all');
  const [_showFilters, _setShowFilters] = useState(false);

  const navigate = useNavigate();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    fetchDrafts();
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchDrafts = async () => {
    try {
      const res = await axios.get('/api/drafts');
      if (isMounted.current) {
        setDrafts(res.data);
      }
    } catch (_error) {
      if (isMounted.current) {
        toast.error('获取草稿失败');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const confirmDelete = (id: number) => {
    setDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`/api/drafts/${deleteId}`);
      setDrafts(drafts.filter(d => d.id !== deleteId));
      setIsDeleteModalOpen(false);
      setDeleteId(null);
      toast.success('草稿已删除');
    } catch (_error) {
      toast.error('删除失败');
    }
  };

  const handleUseDraft = (draft: Draft) => {
    // Navigate based on content type
    navigate('/generate', { state: { draft } });
  };

  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [publishTargetDraft, setPublishTargetDraft] = useState<Draft | null>(null);

  const handlePublishClick = (draft: Draft) => {
      setPublishTargetDraft(draft);
      setIsPublishConfirmOpen(true);
  };

  const handlePublishConfirmed = async () => {
      if (!publishTargetDraft) return;
      await handlePublish(publishTargetDraft);
      setIsPublishConfirmOpen(false);
  };

  const handlePublish = async (draft: Draft, scheduledAt?: string) => {
      // Direct Publish or Scheduled
      try {
          if (!scheduledAt) {
              toast.loading('正在启动发布流程，请勿关闭弹出的浏览器窗口...', { duration: 5000 });
          }
          
          await axios.post('/api/publish/publish', {
              title: draft.title,
              content: draft.content,
              tags: draft.tags,
              autoPublish: true, // Force Auto Publish
              imageData: draft.images || [], // Use stored images
              scheduledAt,
              contentType: draft.content_type || 'note', // Pass content type
              // Note: Drafts page might not have activeAccount context easily unless we fetch it or store it in draft meta
              // For now, let backend handle default active account if not provided
          });
          
          if (scheduledAt) {
              toast.success(`定时发布已设置！将在 ${new Date(scheduledAt).toLocaleString()} 发布。`);
              setIsScheduleModalOpen(false);
          } else {
              toast.success('发布任务已提交队列！');
          }
      } catch (error: any) {
          const errorData = error.response?.data;
          
          if (errorData?.code === 'SESSION_EXPIRED') {
              toast((t) => (
                  <div className="flex flex-col">
                      <span className="font-medium mb-2">账号登录已失效</span>
                      <span className="text-sm text-text-tertiary mb-3">请前往账号矩阵重新登录小红书账号。</span>
                      <div className="flex gap-2">
                          <button 
                              onClick={() => {
                                  toast.dismiss(t.id);
                                  navigate('/accounts');
                              }}
                              className="px-3 py-1 bg-primary text-primary-text text-xs rounded hover:bg-primary-hover"
                          >
                              去登录账号
                          </button>
                          <button 
                              onClick={() => toast.dismiss(t.id)}
                              className="px-3 py-1 bg-surface-hover text-text-secondary text-xs rounded hover:bg-surface-hover"
                          >
                              关闭
                          </button>
                      </div>
                  </div>
              ), { duration: 8000 });
              return;
          }

          toast.error(`发布失败: ${errorData?.error || error.message}`);
      }
  };

  const openScheduleModal = (draft: Draft) => {
      setCurrentDraft(draft);
      // Default to tomorrow 10:00 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      // Format to datetime-local string: YYYY-MM-DDTHH:mm
      const tzOffset = tomorrow.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(tomorrow.getTime() - tzOffset)).toISOString().slice(0, 16);
      setScheduledTime(localISOTime);
      setIsScheduleModalOpen(true);
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
  };

  // Filter drafts
  const filteredDrafts = useMemo(() => {
    return drafts.filter(draft => {
      // Type filter
      if (typeFilter !== 'all' && draft.content_type !== typeFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = draft.title.toLowerCase().includes(query);
        const matchContent = draft.content.toLowerCase().includes(query);
        const matchTags = draft.tags.some(tag => tag.toLowerCase().includes(query));
        return matchTitle || matchContent || matchTags;
      }
      return true;
    });
  }, [drafts, typeFilter, searchQuery]);

  // Get content type label
  const getContentTypeLabel = (type?: string) => {
    switch (type) {
      case 'article': return { text: '深度长文', color: 'bg-primary-subtle text-primary border-primary-subtle', icon: BookOpen };
      case 'note': return { text: '图文笔记', color: 'bg-primary-subtle text-primary border-primary-subtle', icon: FileTextIcon };
      default: return { text: '图文笔记', color: 'bg-primary-subtle text-primary border-primary-subtle', icon: FileTextIcon };
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8 pb-20">
      <div className="max-w-3xl mx-auto">

        <PageHeader 
          title="草稿箱" 
          icon={FileText}
        />

        {/* Filter Bar */}
        {!loading && filteredDrafts.length > 0 && (
          <div className="bg-surface rounded-lg shadow-sm border border-border p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} />
                <input
                  type="text"
                  placeholder="搜索标题、内容或标签..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Type Filter */}
              <div className="flex gap-2">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === 'all'
                      ? 'bg-primary text-primary-text'
                      : 'bg-surface-muted text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setTypeFilter('note')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    typeFilter === 'note'
                      ? 'bg-primary text-primary-text'
                      : 'bg-surface-muted text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <FileTextIcon size={14} />
                  图文笔记
                </button>
                <button
                  onClick={() => setTypeFilter('article')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    typeFilter === 'article'
                      ? 'bg-primary text-primary-text'
                      : 'bg-surface-muted text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <BookOpen size={14} />
                  深度长文
                </button>
              </div>
            </div>
            
            {/* Filter Stats */}
            {(searchQuery || typeFilter !== 'all') && (
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-sm text-text-tertiary">
                  共找到 <span className="font-medium text-text">{filteredDrafts.length}</span> 个草稿
                </span>
                <button
                  onClick={clearFilters}
                  className="text-sm text-primary hover:text-primary-hover flex items-center gap-1"
                >
                  <X size={14} />
                  清除筛选
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <PageLoading message="正在加载草稿列表..." />
        ) : filteredDrafts.length === 0 ? (
          <EmptyState 
            title={searchQuery || typeFilter !== 'all' ? "未找到匹配的草稿" : "暂无草稿"}
            description={searchQuery || typeFilter !== 'all' ? "尝试调整筛选条件" : "去创作第一篇笔记"}
            icon={FileText}
            action={
              searchQuery || typeFilter !== 'all' ? (
                <button 
                  onClick={clearFilters}
                  className="text-primary hover:text-primary-hover mt-2 inline-block"
                >
                  清除筛选条件 &rarr;
                </button>
              ) : (
                <Link to="/generate" className="text-primary hover:text-primary-hover mt-2 inline-block">
                  去创作第一篇笔记 &rarr;
                </Link>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredDrafts.map(draft => (
              <div key={draft.id} className="bg-surface p-5 rounded-xl shadow-sm border border-border hover:shadow-md transition-all flex flex-col h-[320px]">
                {/* Header: Type Badge + Date */}
                <div className="flex justify-between items-center mb-3">
                  {(() => {
                    const typeInfo = getContentTypeLabel(draft.content_type);
                    const Icon = typeInfo.icon;
                    return (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${typeInfo.color}`}>
                        <Icon size={12} />
                        {typeInfo.text}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-text-tertiary">
                    {new Date(draft.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                {/* Title */}
                <h3 className="font-bold text-lg text-text line-clamp-1 mb-3">{draft.title}</h3>
                
                {/* Content Preview - Fixed Height */}
                <div className="flex-1 min-h-0 mb-4">
                    {draft.content_type === 'article' ? (
                        <div className="bg-primary-subtle/50 p-3 rounded-lg border border-primary-subtle h-full">
                             <p className="text-text-secondary text-sm line-clamp-5 leading-relaxed">
                                {draft.content}
                             </p>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            {draft.images && draft.images.length > 0 && (
                                <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                                    {draft.images.slice(0, 3).map((img, i) => (
                                        <div key={i} className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-surface-muted border border-border">
                                            <img src={img} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                    {draft.images.length > 3 && (
                                        <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-surface-muted border border-border flex items-center justify-center text-text-tertiary text-xs">
                                            +{draft.images.length - 3}
                                        </div>
                                    )}
                                </div>
                            )}
                            <p className="text-text-secondary text-sm line-clamp-3 flex-1">{draft.content}</p>
                        </div>
                    )}
                </div>
                
                {/* Tags - Fixed Height */}
                <div className="flex flex-wrap gap-1.5 mb-4 h-6 overflow-hidden">
                  {draft.tags.slice(0, 4).map((tag, i) => (
                    <span key={i} className="text-xs bg-surface-muted text-text-secondary px-2 py-0.5 rounded-full">#{tag}</span>
                  ))}
                  {draft.tags.length > 4 && (
                    <span className="text-xs text-text-tertiary">+{draft.tags.length - 4}</span>
                  )}
                </div>
                
                {/* Actions */}
                <div className="flex items-center justify-between border-t border-border pt-4 mt-auto">
                  <button 
                    onClick={() => confirmDelete(draft.id)}
                    className="p-2 text-text-tertiary hover:text-danger hover:bg-danger-subtle rounded-lg transition-colors"
                    title="删除草稿"
                  >
                    <Trash2 size={18} />
                  </button>
                  
                  <div className="flex gap-2">
                    <button 
                        onClick={() => openScheduleModal(draft)}
                        className="px-3 py-1.5 text-warning bg-warning-subtle hover:bg-warning-subtle rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        <Clock size={14} className="mr-1.5" /> 定时
                    </button>
                    <button 
                        onClick={() => handleUseDraft(draft)}
                        className="px-3 py-1.5 text-primary bg-primary-subtle hover:bg-primary-subtle rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        <Edit size={14} className="mr-1.5" /> 编辑
                    </button>
                    <button 
                        onClick={() => handlePublishClick(draft)}
                        className="px-3 py-1.5 text-primary-text bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"
                    >
                        <Send size={14} className="mr-1.5" /> 发布
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="确认删除草稿"
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-text-secondary bg-surface-muted hover:bg-surface-hover rounded-md text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-primary-text bg-danger hover:bg-danger rounded-md text-sm font-medium"
              >
                确认删除
              </button>
            </div>
          }
        >
          <div className="flex items-start p-2">
            <AlertCircle className="text-danger mr-3 flex-shrink-0" size={24} />
            <div>
              <p className="text-text-secondary font-medium mb-1">您确定要删除这个草稿吗？</p>
              <p className="text-text-tertiary text-sm">
                删除后将无法恢复。
              </p>
            </div>
          </div>
        </Modal>

        {/* Schedule Modal */}
        <Modal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          title="定时发布 (Schedule Publish)"
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="px-4 py-2 text-text-secondary bg-surface-muted hover:bg-surface-hover rounded-md text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={() => currentDraft && handlePublish(currentDraft, new Date(scheduledTime).toISOString())}
                disabled={!scheduledTime}
                className="px-4 py-2 text-primary-text bg-primary hover:bg-primary-hover rounded-md text-sm font-medium disabled:opacity-50"
              >
                确认定时
              </button>
            </div>
          }
        >
          <div className="p-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">选择发布时间</label>
            <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="block w-full rounded-md border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
            />

            <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-text-tertiary py-1">快捷选择:</span>
                {[
                    { label: '现在', get: () => new Date() },
                    { label: '明天 9:00', get: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
                    { label: '明天 12:00', get: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; } },
                    { label: '明天 19:00', get: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(19, 0, 0, 0); return d; } },
                ].map((option) => (
                    <button
                        key={option.label}
                        onClick={() => {
                            const d = option.get();
                            const tzOffset = d.getTimezoneOffset() * 60000;
                            setScheduledTime(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
                        }}
                        className="text-xs px-2 py-1 bg-surface-muted text-text-secondary rounded hover:bg-surface-hover transition-colors"
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <p className="mt-3 text-xs text-text-tertiary flex items-center">
                <AlertCircle size={12} className="mr-1" />
                请确保电脑在设定时间处于开机状态，并且服务正在运行。
            </p>
          </div>
        </Modal>

        {/* Publish Confirmation Modal */}
        <Modal
            isOpen={isPublishConfirmOpen}
            onClose={() => setIsPublishConfirmOpen(false)}
            title="确认发布"
            footer={
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsPublishConfirmOpen(false)}
                        className="px-4 py-2 text-text-secondary bg-surface-muted hover:bg-surface-hover rounded-md text-sm font-medium"
                    >
                        取消
                    </button>
                    <button
                        onClick={handlePublishConfirmed}
                        className="px-4 py-2 text-primary-text bg-primary hover:bg-primary-hover rounded-md text-sm font-medium flex items-center"
                    >
                        <Send size={16} className="mr-2" />
                        立即发布
                    </button>
                </div>
            }
        >
            <div className="p-4">
                <div className="flex items-start mb-4">
                    <AlertCircle className="text-primary mr-3 mt-0.5" size={24} />
                    <div>
                        <h4 className="text-text font-medium mb-1">即将启动自动化发布流程</h4>
                        <p className="text-text-tertiary text-sm">
                            系统将打开一个新的浏览器窗口并自动填写内容。
                        </p>
                    </div>
                </div>
                <div className="bg-primary-subtle p-3 rounded-md border border-primary-subtle text-sm text-primary">
                    <p className="font-medium mb-1">注意事项：</p>
                    <ul className="list-disc list-inside space-y-1 ml-1">
                        <li>请勿关闭弹出的浏览器窗口</li>
                        <li>请勿在自动化过程中操作鼠标干扰</li>
                        <li>发布完成后窗口将自动关闭</li>
                    </ul>
                </div>
            </div>
        </Modal>

      </div>
    </div>
  );
}
