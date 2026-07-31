
import axios from '@/lib/axios';
import { 
  MessageSquare, RefreshCw, Send, 
  Bot, User, Clock, CheckCircle, AlertTriangle, Trash2, ChevronLeft, ChevronRight,
  Heart, Frown, Diamond, MessageCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useState, useEffect } from "react";
import { getFriendlyError, extractAxiosErrorMessage } from '../utils/ErrorMessages';

interface Comment {
  id: string;
  user_nickname: string;
  user_avatar: string;
  content: string;
  create_time: string;
  reply_status: 'UNREAD' | 'READ' | 'REPLIED' | 'IGNORED';
  parent_id?: string;
  intent?: 'PRAISE' | 'COMPLAINT' | 'INQUIRY' | 'OTHER';
  ai_reply_suggestion?: string;
  type?: 'COMMENT' | 'MENTION';
}

const INTENT_CONFIG = {
  PRAISE: { label: '夸奖', color: 'bg-success-subtle text-success border-success-subtle', Icon: Heart },
  COMPLAINT: { label: '吐槽', color: 'bg-danger-subtle text-danger border-danger-subtle', Icon: Frown },
  INQUIRY: { label: '询单', color: 'bg-primary-subtle text-primary border-primary-subtle', Icon: Diamond },
  OTHER: { label: '其他', color: 'bg-surface-muted text-text-secondary border-border', Icon: MessageCircle }
};

export default function Engagement() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  type CommentFilter = 'ALL' | 'UNREAD' | 'REPLIED';
  const [filter, setFilter] = useState<CommentFilter>('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  
  // Default page size reduced to 10 for better UX on smaller screens
  const [pageSize, setPageSize] = useState(10); 
  
  const [scraping, setScraping] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);
  const [activeAccount, setActiveAccount] = useState<any>(null);

  const fetchActiveAccount = async () => {
      try {
          const res = await axios.get('/api/accounts');
          if (Array.isArray(res.data)) {
              const active = res.data.find((a: any) => a.is_active);
              setActiveAccount(active);
          }
      } catch (_e) {
          toast.error('活跃账号加载失败');
      }
  };

  useEffect(() => {
      fetchActiveAccount();
  }, []);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/comments', {
        params: { 
            status: filter === 'ALL' ? undefined : filter,
            page,
            pageSize
        }
      });
      // Ensure data is array
      setComments(Array.isArray(res.data.data) ? res.data.data : []);
      if (res.data.pagination) {
          setPagination({
              total: res.data.pagination.total,
              totalPages: res.data.pagination.totalPages
          });
      }
    } catch (error) {
      const friendly = getFriendlyError(extractAxiosErrorMessage(error));
      toast.error(`${friendly.title}: ${friendly.message}。${friendly.suggestion}`, {
        duration: 5000
      });
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1); // Reset page on filter change
  }, [filter]);

  useEffect(() => {
    fetchComments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);

  const handleScrape = async () => {
    setScraping(true);
    const toastId = toast.loading('正在同步评论...');
    try {
      const res = await axios.post('/api/comments/scrape');
      const { taskId } = res.data;
      
      // Poll Task Status
      let taskStatus = 'PENDING';
      let attempts = 0;
      
      while (taskStatus === 'PENDING' || taskStatus === 'PROCESSING') {
          await new Promise(r => setTimeout(r, 2000));
          attempts++;
          
          try {
              const taskRes = await axios.get(`/api/tasks/${taskId}`);
              const task = taskRes.data;
              taskStatus = task.status;
              
              if (taskStatus === 'COMPLETED') {
                  toast.success(`同步完成！发现 ${task.result.count} 条评论`, { id: toastId });
                  fetchComments();
                  return;
              } else if (taskStatus === 'FAILED') {
                  throw new Error(task.error || '任务执行失败');
              }
              
              if (attempts > 60) throw new Error('同步超时');
          } catch (e: any) {
              if (e.message.includes('超时') || e.message.includes('失败')) throw e;
          }
      }
    } catch (error: any) {
      const friendly = getFriendlyError(extractAxiosErrorMessage(error));
      toast.error(`抓取失败：${friendly.title} - ${friendly.message}。${friendly.suggestion}`, {
        id: toastId,
        duration: 6000
      });
    } finally {
      setScraping(false);
    }
  };

  const handleReply = async (commentId: string) => {
    if (!replyContent.trim()) {
        toast.error('请输入回复内容');
        return;
    }
    setSending(true);
    try {
      await axios.post('/api/comments/reply', {
        commentId,
        content: replyContent
      });
      toast.success('回复已发送！');
      setReplyingId(null);
      setReplyContent('');
      fetchComments();
    } catch (error: any) {
      toast.error(`回复失败: ${error.response?.data?.error || error.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleIgnore = async (id: string) => {
    if (!window.confirm('确定忽略该评论吗？')) return;
    try {
      await axios.post(`/api/comments/${id}/ignore`);
      toast.success('已忽略该评论');
      fetchComments();
    } catch (_e: any) {
      toast.error('操作失败');
    }
  };

  const generateAiReply = async (commentId: string, _content: string) => {
    // If there is already a suggestion, use it first
    const comment = comments.find(c => c.id === commentId);
    if (comment && comment.ai_reply_suggestion) {
        setReplyContent(comment.ai_reply_suggestion);
        return;
    }

    // Call the backend AI suggestion endpoint
    try {
        const res = await axios.get(`/api/comments/${commentId}/suggestion`);
        setReplyContent(res.data.suggestion);
    } catch (_e: any) {
        // Fallback: use mock replies if API fails
        const replies = [
            "感谢关注！我们会继续努力的",
            "哈哈，你说得对！",
            "宝子很有眼光哦",
            "收到建议啦，这就去改！"
        ];
        setReplyContent(replies[Math.floor(Math.random() * replies.length)]);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">

            <div>
              <h1 className="text-2xl font-bold text-text flex items-center">
                <MessageSquare className="w-7 h-7 mr-2 text-primary" />
                互动中心
              </h1>
              <p className="text-text-tertiary text-sm mt-1">管理评论与粉丝互动</p>
            </div>
          </div>
          
          <button 
            onClick={handleScrape}
            disabled={scraping}
            className={`
              flex items-center px-4 py-2 rounded-lg text-primary-text font-medium transition-all
              ${scraping ? 'bg-text-tertiary cursor-not-allowed' : 'bg-primary hover:bg-primary-hover shadow-md hover:shadow-lg'}
            `}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${scraping ? 'animate-spin' : ''}`} />
            {scraping ? '正在抓取...' : '同步最新评论'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex justify-between items-end border-b border-border mb-6 pb-1">
            <div className="flex space-x-2">
            {[
                { key: 'ALL', label: '全部评论' },
                { key: 'UNREAD', label: '待回复' },
                { key: 'REPLIED', label: '已回复' }
            ].map((tab) => (
                <button
                key={tab.key}
                onClick={() => setFilter(tab.key as CommentFilter)}
                className={`
                    px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative top-[1px]
                    ${filter === tab.key 
                    ? 'bg-surface text-primary border border-b-white border-border' 
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-muted'}
                `}
                >
                {tab.label}
                </button>
            ))}
            </div>
            
            <div className="flex items-center text-sm text-text-tertiary mb-2">
                <span className="mr-2">每页:</span>
                <select 
                    value={pageSize}
                    onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                    }}
                    disabled={loading}
                    className="border-strong rounded-md text-xs py-1 pl-2 pr-6 focus:ring-primary focus:border-primary disabled:opacity-50"
                >
                    <option value="10">10条</option>
                    <option value="20">20条</option>
                    <option value="50">50条</option>
                    <option value="100">100条</option>
                </select>
            </div>
        </div>

        {/* List */}
        {loading ? (
           <div className="flex justify-center py-12">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
           </div>
        ) : comments.length === 0 ? (
           <div className="text-center py-12 bg-surface rounded-xl border border-dashed border-strong">
             <MessageSquare className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
             <p className="text-text-tertiary mb-2">暂无评论数据</p>
             {activeAccount ? (
                 <p className="text-sm text-text-tertiary">当前账号 "{activeAccount.nickname}" 暂无新评论，请点击右上角同步</p>
             ) : (
                 <p className="text-sm text-danger">未检测到活跃账号，请先在账号矩阵中激活一个账号</p>
             )}
           </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="bg-surface p-5 rounded-xl shadow-sm border border-border hover:shadow-md transition-shadow">
                <div className="flex items-start space-x-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {comment.user_avatar ? (
                      <img src={comment.user_avatar} alt={comment.user_nickname} className="w-10 h-10 rounded-full object-cover border border-border" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-tertiary">
                        <User size={20} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-text text-sm flex items-center">
                            {comment.user_nickname}
                            {comment.type === 'MENTION' && (
                                <span className="ml-2 px-1.5 py-0.5 bg-primary-subtle text-primary text-[10px] rounded border border-primary-subtle font-normal">
                                    @了你
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-text-tertiary flex items-center mt-1">
                          <Clock size={12} className="mr-1" />
                          {new Date(comment.create_time).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {comment.reply_status === 'REPLIED' && (
                          <span className="bg-success-subtle text-success text-xs px-2 py-1 rounded-full flex items-center">
                            <CheckCircle size={10} className="mr-1" /> 已回复
                          </span>
                        )}
                        {comment.reply_status === 'UNREAD' && (
                          <span className="bg-warning-subtle text-warning text-xs px-2 py-1 rounded-full flex items-center">
                            <AlertTriangle size={10} className="mr-1" /> 待处理
                          </span>
                        )}
                        {/* Intent Badge */}
                        {comment.intent && INTENT_CONFIG[comment.intent] && (() => {
                          const config = INTENT_CONFIG[comment.intent];
                          const Icon = config.Icon;
                          return (
                            <span className={`text-xs px-2 py-1 rounded-full border flex items-center ${config.color}`}>
                               <Icon size={12} className="mr-1" />
                               {config.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <p className="mt-2 text-text text-sm leading-relaxed bg-surface-muted p-3 rounded-lg">
                      {comment.content}
                    </p>

                    {/* AI Suggestion (Quick Action) */}
                    {comment.ai_reply_suggestion && !replyingId && comment.reply_status === 'UNREAD' && (
                        <div 
                          onClick={() => {
                              setReplyingId(comment.id);
                              setReplyContent(comment.ai_reply_suggestion!);
                          }}
                          className="mt-2 cursor-pointer group"
                        >
                            <div className="flex items-start space-x-2 bg-gradient-to-r from-primary-subtle to-primary-subtle p-2 rounded-lg border border-primary-subtle hover:border-primary-subtle transition-colors">
                                <Bot size={16} className="text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-primary font-medium mb-0.5 flex items-center">
                                        AI 建议回复 
                                        <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-primary text-[10px]">点击使用</span>
                                    </p>
                                    <p className="text-xs text-text-secondary line-clamp-1 group-hover:line-clamp-none transition-all">
                                        {comment.ai_reply_suggestion}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Area */}
                    <div className="mt-3">
                      {replyingId === comment.id ? (
                        <div className="bg-primary-subtle p-3 rounded-lg border border-primary-subtle animate-in fade-in slide-in-from-top-2">
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-semibold text-primary">回复 @{comment.user_nickname}</span>
                              <button 
                                onClick={() => generateAiReply(comment.id, comment.content)}
                                className="text-xs flex items-center text-primary hover:text-primary-hover bg-surface px-2 py-1 rounded border border-primary-subtle shadow-sm"
                              >
                                <Bot size={12} className="mr-1" /> AI 帮我想
                              </button>
                           </div>
                           <textarea
                             value={replyContent}
                             onChange={(e) => setReplyContent(e.target.value)}
                             placeholder="输入回复内容（注意：禁止包含导流违禁词）..."
                             className="w-full text-sm p-2 border border-primary-subtle rounded-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none min-h-[80px]"
                           />
                           <div className="flex justify-end space-x-2 mt-2">
                             <button 
                               onClick={() => setReplyingId(null)}
                               className="px-3 py-1.5 text-xs text-text-tertiary hover:bg-surface-hover rounded"
                             >
                               取消
                             </button>
                             <button 
                               onClick={() => handleReply(comment.id)}
                               disabled={sending}
                               className="px-3 py-1.5 text-xs bg-primary text-primary-text rounded hover:bg-primary-hover flex items-center disabled:opacity-50"
                             >
                               {sending ? <RefreshCw className="w-3 h-3 animate-spin mr-1"/> : <Send className="w-3 h-3 mr-1"/>}
                               发送回复
                             </button>
                           </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-3">
                          <button 
                            onClick={() => {
                              setReplyingId(comment.id);
                              setReplyContent('');
                            }}
                            className="text-sm text-text-tertiary hover:text-primary font-medium flex items-center transition-colors"
                          >
                            <MessageSquare size={14} className="mr-1" />
                            回复
                          </button>
                          <button 
                            onClick={() => handleIgnore(comment.id)}
                            className="p-1 text-text-tertiary hover:text-text-secondary rounded flex items-center text-sm"
                            title="忽略"
                          >
                            <Trash2 size={14} className="mr-1"/> 忽略
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {comments.length > 0 && (
            <div className="bg-surface px-4 py-3 flex items-center justify-between border-t border-border sm:px-6 rounded-b-xl sticky bottom-0 z-10 shadow-md">
                <div className="flex-1 flex justify-between sm:hidden">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-strong text-sm font-medium rounded-md text-text-secondary bg-surface hover:bg-surface-muted disabled:opacity-50"
                    >
                        上一页
                    </button>
                    <button
                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                        disabled={page === pagination.totalPages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-strong text-sm font-medium rounded-md text-text-secondary bg-surface hover:bg-surface-muted disabled:opacity-50"
                    >
                        下一页
                    </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm text-text-secondary">
                            显示第 <span className="font-medium">{page}</span> 页，共 <span className="font-medium">{pagination.totalPages}</span> 页，总计 <span className="font-medium">{pagination.total}</span> 条
                        </p>
                    </div>
                    <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-strong bg-surface text-sm font-medium text-text-tertiary hover:bg-surface-muted disabled:opacity-50"
                            >
                                <span className="sr-only">Previous</span>
                                <ChevronLeft size={16} />
                            </button>
                            
                            <span className="relative inline-flex items-center px-4 py-2 border border-strong bg-surface text-sm font-medium text-text-secondary">
                                第 {page} 页
                            </span>

                            <button
                                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                disabled={page === pagination.totalPages}
                                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-strong bg-surface text-sm font-medium text-text-tertiary hover:bg-surface-muted disabled:opacity-50"
                            >
                                <span className="sr-only">Next</span>
                                <ChevronRight size={16} />
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
