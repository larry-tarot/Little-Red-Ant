import axios from '@/lib/axios';
import { Clock, Loader2, RefreshCw, CheckCircle, XCircle, PlayCircle, AlertCircle, Eye, Calendar, List, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { fetchSseToken } from '@/lib/sseToken';
import TaskProgress, { TaskStatusBadge, TaskTypeLabel } from '../components/TaskProgress';
import FriendlyError from '../components/FriendlyError';
import { Button } from '@/components/ui';
import { wrapError } from '../utils/ErrorMessages';
import { useState, useEffect } from "react";

interface FriendlyErrorData {
    code?: string;
    title: string;
    message: string;
    suggestion: string;
    severity: 'error' | 'warning' | 'info';
}

interface Task {
  id: string;
  type: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  payload: any;
  result?: any;
  error?: string;
  scheduled_at?: string;
  created_at: string;
  updated_at: string;
  progress?: number;
  attempts?: number;
  currentStep?: string;
  friendlyError?: FriendlyErrorData;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, _setPageSize] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  
  // Calendar Day Tasks Modal State
  const [selectedDayTasks, setSelectedDayTasks] = useState<Task[] | null>(null);
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  
  const navigate = useNavigate();

  // 对于需要重新授权/绑定账号的错误，在错误卡片上提供一键跳转
  const getErrorAction = (error?: FriendlyErrorData) => {
      if (!error?.code) return undefined;
      if (error.code === 'COOKIE_EXPIRED' || error.code === 'NO_ACTIVE_ACCOUNT') {
          return { label: '前往账号矩阵', onClick: () => navigate('/accounts') };
      }
      return undefined;
  };

  // Open day tasks modal
  const openDayTasks = (dayTasks: Task[], date: Date) => {
      setSelectedDayTasks(dayTasks);
      setSelectedDayDate(date);
  };
  
  // Close day tasks modal
  const closeDayTasks = () => {
      setSelectedDayTasks(null);
      setSelectedDayDate(null);
  };

  useEffect(() => {
    fetchTasks();

    // Auto-refresh every 5 seconds if there are active tasks
    const interval = setInterval(() => {
        if (viewMode === 'list') {
            setTasks(currentTasks => {
                const hasActive = currentTasks.some(t => t.status === 'PENDING' || t.status === 'PROCESSING');
                if (hasActive) {
                    fetchTasks(true);
                }
                return currentTasks;
            });
        }
    }, 5000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentDate, page, pageSize]);



  /**
   * 功能描述：建立 SSE 长连接并自动续期/重连
   *
   * 设计思路：
   * 1. SSE token 有效期只有 5 分钟，过期后端会断开连接。
   * 2. 前端在连接断开时自动重新获取 token 并重连，最多重试 10 次。
   * 3. 采用指数退避延迟，避免失败后疯狂重连。
   * 4. 组件卸载或页面隐藏时清理定时器，防止内存泄漏。
   */
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 10;

    const connectSse = async () => {
      if (cancelled || retryCount >= MAX_RETRIES) return;

      try {
        // 每次重连都重新获取短期 SSE token，避免使用过期 token
        const sseToken = await fetchSseToken();
        if (cancelled) return;

        const sseUrl = `/api/tasks/active?sse_token=${encodeURIComponent(sseToken)}`;
        es = new EventSource(sseUrl, { withCredentials: true });

        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            // 实时更新任务进度和当前阶段
            setTasks(current => current.map(t =>
              t.id === data.taskId
                ? {
                    ...t,
                    progress: typeof data.progress === 'number' ? data.progress : t.progress,
                    currentStep: data.stage || t.currentStep,
                  }
                : t
            ));
            // 任务到达终态后拉取完整列表以获取结果
            if (data.status === 'COMPLETED' || data.status === 'FAILED') {
              fetchTasks(true);
            }
          } catch { /* ignore heartbeat / malformed message */ }
        };

        es.onopen = () => {
          // 连接成功时重置重试计数
          retryCount = 0;
        };

        es.onerror = () => {
          // 连接异常时关闭当前连接，稍后自动重连
          es?.close();
          es = null;

          if (cancelled || retryCount >= MAX_RETRIES) return;

          retryCount++;
          // 指数退避：1s, 2s, 4s, 8s... 最大 30s
          const delayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
          console.log(`[Tasks] SSE 断开，${delayMs}ms 后第 ${retryCount} 次重连...`);

          reconnectTimer = setTimeout(() => {
            if (!cancelled) connectSse();
          }, delayMs);
        };
      } catch (e) {
        console.warn('[Tasks] 获取 SSE token 失败，降级为轮询:', e);
      }
    };

    connectSse();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTasks = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    
    try {
      const url = '/api/tasks';
      let params: any = {};

      if (viewMode === 'calendar') {
          const year = currentDate.getFullYear();
          const month = currentDate.getMonth();
          const start = new Date(year, month, 1).toISOString();
          const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
          params = { start_date: start, end_date: end };
          // Calendar mode gets all tasks for the month, no pagination for now or handled differently
      } else {
          params = { page, pageSize };
      }

      const res = await axios.get(url, { params });
      
      if (res.data.pagination) {
          setTasks(res.data.data);
          setPagination({
              total: res.data.pagination.total,
              totalPages: res.data.pagination.totalPages
          });
      } else if (Array.isArray(res.data)) {
           // Fallback for calendar or legacy
           setTasks(res.data);
      } else if (res.data.data && Array.isArray(res.data.data)) {
            // Should be covered by pagination check, but just in case
            setTasks(res.data.data);
      } else {
          // Unexpected format
          toast.error('任务列表格式异常');
          setTasks([]);
      }
      
    } catch (_error) {
      if (!isBackground) toast.error('获取任务列表失败');
      setTasks([]); // Ensure array
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRetry = async (taskId?: string) => {
      const id = taskId || retryingTask?.id;
      if (!id) return;

      try {
          await axios.post(`/api/tasks/${id}/retry`);
          toast.success('任务已重试');
          setRetryingTask(null);
          fetchTasks(true);
      } catch (_e) {
          toast.error('重试失败');
      }
  };

  const confirmRetry = () => handleRetry();

  const [confirmingTask, setConfirmingTask] = useState<string | null>(null);
  const [retryingTask, setRetryingTask] = useState<Task | null>(null);

  const handleCancel = (taskId: string) => {
      setConfirmingTask(taskId);
  };

  const openRetryConfirm = (task: Task) => {
      setRetryingTask(task);
  };

  const closeRetryConfirm = () => {
      setRetryingTask(null);
  };

  const confirmCancel = async () => {
      if (!confirmingTask) return;
      
      try {
          await axios.post(`/api/tasks/${confirmingTask}/cancel`);
          toast.success('任务已终止');
          fetchTasks(true);
      } catch (_e) {
          toast.error('终止任务失败');
      } finally {
          setConfirmingTask(null);
      }
  };

  const getStatusIcon = (status: string) => {
      switch (status) {
        case 'COMPLETED': return <CheckCircle className="text-success" size={16} />;
        case 'FAILED': return <XCircle className="text-danger" size={16} />;
        case 'PROCESSING': return <Loader2 className="animate-spin text-primary" size={16} />;
        case 'CANCELLED': return <XCircle className="text-text-tertiary" size={16} />;
        default: return <Clock className="text-text-tertiary" size={16} />;
      }
  };

  const getStatusText = (task: Task) => {
      if (task.status === 'PENDING' && task.scheduled_at) {
          const scheduledTime = new Date(task.scheduled_at).getTime();
          if (scheduledTime > Date.now()) {
              return '已计划';
          }
      }

      switch (task.status) {
          case 'COMPLETED': return '已完成';
          case 'FAILED': return '失败';
          case 'PROCESSING': return '执行中';
          case 'PENDING': return '排队中';
          case 'CANCELLED': return '已终止';
          default: return task.status;
      }
  };

  const getTaskName = (type: string) => {
      switch (type) {
          case 'PUBLISH': return '发布笔记';
          case 'SCRAPE_STATS': return '同步数据';
          case 'SCRAPE_COMMENTS': return '抓取评论';
          case 'SCRAPE_TRENDS': return '抓取热点';
          case 'SCRAPE_COMPETITOR': return '更新对标账号数据';
          case 'GENERATE_CONTENT': return 'AI生成文案';
          case 'GENERATE_IMAGE': return 'AI生成配图';
          case 'GENERATE_VIDEO': return 'AI生成视频';
          default: return type;
      }
  };

  const handleViewResult = (task: Task) => {
      if (task.status !== 'COMPLETED' || !task.result) return;

      try {
          // Safety check for result validity
          if (task.type === 'GENERATE_CONTENT') {
              // Ensure result matches GeneratedContent structure
              if (typeof task.result === 'object' && task.result.title) {
                 navigate('/generate', { state: { generatedResult: task.result } });
              } else {
                 toast.error('结果数据格式无效');
              }
          } else if (task.type === 'GENERATE_VIDEO') {
              if (task.result.url) window.open(task.result.url, '_blank');
              else toast.error('视频链接无效');
          } else if (task.type === 'GENERATE_IMAGE') {
              if (task.result.url) window.open(task.result.url, '_blank');
              else toast.error('图片链接无效');
          }
      } catch (_e) {
          toast.error('无法查看详情');
      }
  };
  
  // --- Calendar Helpers ---
  const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const days = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
      return { days, firstDay };
  };

  const changeMonth = (delta: number) => {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + delta);
      setCurrentDate(newDate);
  };

  const renderCalendar = () => {
      const { days, firstDay } = getDaysInMonth(currentDate);
      const cells = [];
      
      // 空白格子
      for (let i = 0; i < firstDay; i++) {
          cells.push(<div key={`empty-${i}`} className="min-h-[100px] bg-surface-muted/50 border border-border"></div>);
      }
      
      for (let d = 1; d <= days; d++) {
          const _dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          
          const dayTasks = tasks.filter(t => {
              const targetDate = t.scheduled_at ? new Date(t.scheduled_at) : new Date(t.created_at);
              return targetDate.getDate() === d && targetDate.getMonth() === currentDate.getMonth() && targetDate.getFullYear() === currentDate.getFullYear();
          });
          
          const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toDateString();
          const visibleTasks = dayTasks.slice(0, 3);
          const hasMore = dayTasks.length > 3;

          cells.push(
              <div key={d} className={`
                  min-h-[100px] border border-border p-2 transition-all relative group
                  ${isToday ? 'bg-primary-subtle/40 border-l-4 border-l-primary' : 'bg-surface hover:bg-surface-muted/50'}
              `}>
                  {/* 日期头部 */}
                  <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${isToday ? 'text-primary' : 'text-text-secondary'}`}>
                          {d}
                      </span>
                      {isToday && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary-subtle text-primary rounded-full font-medium">
                              今天
                          </span>
                      )}
                  </div>
                  
                  {/* 任务列表 */}
                  <div className="space-y-1">
                      {visibleTasks.map((task, _index) => (
                          <div 
                              key={task.id} 
                              className={`
                                  text-[11px] px-2 py-1.5 rounded-md border cursor-pointer 
                                  transition-all hover:shadow-md hover:scale-[1.02]
                                  ${task.status === 'FAILED' ? 'bg-danger-subtle border-danger-subtle text-danger hover:bg-danger/10' : 
                                    task.status === 'COMPLETED' ? 'bg-success-subtle border-success-subtle text-success hover:bg-success/10' : 
                                    task.status === 'PROCESSING' ? 'bg-primary-subtle border-primary-subtle text-primary hover:bg-primary/10' :
                                    'bg-surface-muted border-border text-text-secondary hover:bg-surface-hover'}
                              `}
                              title={`${getTaskName(task.type)} - ${getStatusText(task)}${task.error ? '\n错误: ' + task.error : ''}`}
                          >
                              <div className="flex items-center gap-1.5">
                                  <span className="flex-shrink-0">{getStatusIcon(task.status)}</span>
                                  <span className="truncate flex-1 font-medium">{task.payload?.title || getTaskName(task.type)}</span>
                              </div>
                              {task.scheduled_at && (
                                  <div className="text-[10px] opacity-70 mt-0.5 pl-5">
                                      {new Date(task.scheduled_at).getHours()}:{String(new Date(task.scheduled_at).getMinutes()).padStart(2, '0')}
                                  </div>
                              )}
                          </div>
                      ))}
                      
                      {/* 更多任务提示 */}
                      {hasMore && (
                          <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  openDayTasks(dayTasks, new Date(currentDate.getFullYear(), currentDate.getMonth(), d));
                              }}
                              className="w-full text-[10px] text-text-tertiary text-center py-1 hover:text-primary hover:bg-primary-subtle rounded transition-all"
                          >
                              +{dayTasks.length - 3} 更多任务
                          </button>
                      )}
                  </div>
                  
                  {/* 空状态提示 */}
                  {dayTasks.length === 0 && (
                                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigate('/generate');
                                              }}
                                              className="text-xs text-text-tertiary hover:text-primary hover:bg-primary-subtle px-3 py-1.5 rounded-full border border-dashed border-border-strong hover:border-primary-subtle transition-all"
                                          >
                                              + 去创作
                                          </button>
                                      </div>
                                  )}
              </div>
          );
      }
      
      return cells;
  };

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8 relative">
      {retryingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface rounded-lg shadow-xl max-w-sm w-full overflow-hidden transform transition-all scale-100 opacity-100">
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-warning-subtle rounded-full flex-shrink-0">
                            <RotateCw className="w-6 h-6 text-warning" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-text">重试任务</h3>
                            <p className="text-sm text-text-tertiary mt-1">
                                确定要重新执行「{getTaskName(retryingTask.type)}」吗？
                            </p>
                        </div>
                    </div>
                    {retryingTask.error && (
                        <div className="bg-surface-muted p-3 rounded-md mb-4 text-xs text-text-secondary max-h-24 overflow-y-auto">
                            <span className="font-medium text-text">上次失败原因：</span>
                            <p className="mt-1">{retryingTask.error}</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={closeRetryConfirm}
                        >
                            取消
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={confirmRetry}
                        >
                            确认重试
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {confirmingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface rounded-lg shadow-xl max-w-sm w-full overflow-hidden transform transition-all scale-100 opacity-100">
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-danger-subtle rounded-full flex-shrink-0">
                            <AlertCircle className="w-6 h-6 text-danger" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-text">终止任务</h3>
                            <p className="text-sm text-text-tertiary mt-1">
                                确定要强制终止此任务吗？此操作无法撤销。
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmingTask(null)}
                        >
                            取消
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={confirmCancel}
                        >
                            确认终止
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div className="flex items-center">

                <h1 className="text-2xl font-bold text-text flex items-center">
                    <PlayCircle className="mr-2 text-primary" />
                    任务中心
                </h1>
            </div>
            
            <div className="flex items-center gap-2 bg-surface p-1 rounded-lg border border-border shadow-sm">
                <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-md flex items-center text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-primary-subtle text-primary' : 'text-text-tertiary hover:bg-surface-muted'}`}
                >
                    <List size={16} className="mr-2" /> 列表视图
                </button>
                <button
                    onClick={() => setViewMode('calendar')}
                    className={`p-2 rounded-md flex items-center text-sm font-medium transition-colors ${viewMode === 'calendar' ? 'bg-primary-subtle text-primary' : 'text-text-tertiary hover:bg-surface-muted'}`}
                >
                    <Calendar size={16} className="mr-2" /> 内容日历
                </button>
            </div>

            <button
                onClick={() => fetchTasks()}
                className={`p-2 rounded-full hover:bg-surface-hover transition-colors ${refreshing ? 'animate-spin' : ''}`}
                title="刷新"
            >
                <RefreshCw size={20} className="text-text-secondary" />
            </button>
        </div>

        {viewMode === 'calendar' ? (
            <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
                {/* Calendar Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-surface-muted/50">
                    <h2 className="text-lg font-semibold text-text">
                        {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
                    </h2>
                    <div className="flex space-x-2">
                        <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-surface rounded-md border border-transparent hover:border-border hover:shadow-sm transition-all text-text-secondary">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md hover:bg-surface-muted text-text-secondary">
                            今天
                        </button>
                        <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-surface rounded-md border border-transparent hover:border-border hover:shadow-sm transition-all text-text-secondary">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
                
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-xs font-medium text-text-tertiary text-center py-2">
                    <div>周日</div>
                    <div>周一</div>
                    <div>周二</div>
                    <div>周三</div>
                    <div>周四</div>
                    <div>周五</div>
                    <div>周六</div>
                </div>
                
                {/* Calendar Grid */}
                <div className="grid grid-cols-7 bg-border gap-px border-b border-border">
                    {loading && !refreshing ? (
                        <div className="col-span-7 h-96 flex items-center justify-center bg-surface">
                             <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : renderCalendar()}
                </div>
                
                <div className="p-4 bg-surface-muted text-xs text-text-tertiary flex gap-4">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary"></div> 执行中</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-success"></div> 已完成</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-danger"></div> 失败</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-border-strong"></div> 排队/草稿</div>
                </div>
            </div>
        ) : (
            // List View
            loading && !refreshing && tasks.length === 0 ? (
            <div className="text-center py-20">
                <Loader2 className="animate-spin h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-text-tertiary">加载中...</p>
            </div>
            ) : (
            <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                        <thead className="bg-surface-muted">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">状态</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">任务类型</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">创建时间</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">耗时/详情</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-surface divide-y divide-border">
                            {tasks.map(task => (
                                <tr key={task.id} className="hover:bg-surface-muted">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <TaskStatusBadge status={task.status} progress={task.progress} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <TaskTypeLabel type={task.type} />
                                        <div className="text-xs text-text-tertiary font-mono mt-1">{task.id.substring(0, 8)}...</div>
                                        {task.payload?.title && (
                                            <div className="text-xs text-text-tertiary truncate max-w-[150px] mt-0.5">{task.payload.title}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary">
                                        {new Date(task.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-text-tertiary max-w-[300px]">
                                        {task.status === 'PROCESSING' ? (
                                            <TaskProgress
                                                status={task.status}
                                                progress={task.progress}
                                                currentStep={task.currentStep}
                                                className="max-w-[250px]"
                                            />
                                        ) : task.status === 'FAILED' ? (
                                            <FriendlyError
                                                error={task.friendlyError || wrapError(task.error || 'Unknown error').friendly}
                                                action={getErrorAction(task.friendlyError || wrapError(task.error || 'Unknown error').friendly)}
                                                className="max-w-[250px]"
                                            />
                                        ) : (
                                            <span>
                                                {task.updated_at && task.created_at ?
                                                    `${((new Date(task.updated_at).getTime() - new Date(task.created_at).getTime()) / 1000).toFixed(1)}s`
                                                    : '-'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary">
                                        {task.status === 'COMPLETED' && task.type === 'GENERATE_CONTENT' && (
                                            <button 
                                                onClick={() => handleViewResult(task)} 
                                                className="text-primary hover:text-primary-hover flex items-center text-xs font-medium bg-primary-subtle px-2 py-1 rounded"
                                            >
                                                <Eye size={14} className="mr-1" /> 查看结果
                                            </button>
                                        )}
                                        {task.status === 'FAILED' && (
                                            <button 
                                                onClick={() => openRetryConfirm(task)}
                                                className="text-danger hover:text-danger flex items-center text-xs font-medium bg-danger-subtle px-2 py-1 rounded"
                                            >
                                                <RotateCw size={14} className="mr-1" /> 重试
                                            </button>
                                        )}
                                        {(task.status === 'PENDING' || task.status === 'PROCESSING') && (
                                            <button 
                                                onClick={() => handleCancel(task.id)}
                                                className="text-text-secondary hover:text-text flex items-center text-xs font-medium bg-surface-muted px-2 py-1 rounded ml-2"
                                                title="终止任务"
                                            >
                                                <XCircle size={14} className="mr-1" /> 终止
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {tasks.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center text-text-tertiary">
                                            <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
                                                <PlayCircle size={28} className="opacity-50" />
                                            </div>
                                            <p className="font-medium text-text mb-1">暂无任务记录</p>
                                            <p className="text-sm">在「智能创作」或「数据同步」中提交任务后，将在此显示进度</p>
                                            <button
                                                onClick={() => navigate('/generate')}
                                                className="mt-4 text-primary hover:text-primary-hover text-sm font-medium"
                                            >
                                                去创作内容 →
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {viewMode === 'list' && pagination.totalPages > 1 && (
                    <div className="bg-surface px-4 py-3 flex items-center justify-between border-t border-border sm:px-6">
                        <div className="flex-1 flex justify-between sm:hidden">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="relative inline-flex items-center px-4 py-2 border border-border-strong text-sm font-medium rounded-md text-text-secondary bg-surface hover:bg-surface-muted disabled:opacity-50"
                            >
                                上一页
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                disabled={page === pagination.totalPages}
                                className="ml-3 relative inline-flex items-center px-4 py-2 border border-border-strong text-sm font-medium rounded-md text-text-secondary bg-surface hover:bg-surface-muted disabled:opacity-50"
                            >
                                下一页
                            </button>
                        </div>
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm text-text-secondary">
                                    显示 <span className="font-medium">{(page - 1) * pageSize + 1}</span> 到 <span className="font-medium">{Math.min(page * pageSize, pagination.total)}</span> 条，共 <span className="font-medium">{pagination.total}</span> 条
                                </p>
                            </div>
                            <div>
                                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-border-strong bg-surface text-sm font-medium text-text-tertiary hover:bg-surface-muted disabled:opacity-50"
                                    >
                                        <span className="sr-only">Previous</span>
                                        <ChevronLeft size={16} />
                                    </button>
                                    
                                    {/* Simple Page Indicator */}
                                    <span className="relative inline-flex items-center px-4 py-2 border border-border-strong bg-surface text-sm font-medium text-text-secondary">
                                        第 {page} 页 / 共 {pagination.totalPages} 页
                                    </span>

                                    <button
                                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                        disabled={page === pagination.totalPages}
                                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-border-strong bg-surface text-sm font-medium text-text-tertiary hover:bg-surface-muted disabled:opacity-50"
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
            )
        )}
      </div>
      
      {/* Day Tasks Modal */}
      {selectedDayTasks && selectedDayDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-surface-muted">
                      <div>
                          <h3 className="text-lg font-bold text-text">
                              {selectedDayDate.getMonth() + 1}月{selectedDayDate.getDate()}日 任务列表
                          </h3>
                          <p className="text-xs text-text-tertiary mt-0.5">
                              共 {selectedDayTasks.length} 个任务
                          </p>
                      </div>
                      <button 
                          onClick={closeDayTasks}
                          className="text-text-tertiary hover:text-text-secondary bg-surface p-1.5 rounded-full border border-border hover:bg-surface-muted transition-colors"
                      >
                          <XCircle size={20}/>
                      </button>
                  </div>
                  
                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto flex-1">
                      <div className="space-y-3">
                          {selectedDayTasks.map((task) => (
                              <div 
                                  key={task.id} 
                                  className="p-4 rounded-lg border border-border hover:border-primary-subtle hover:shadow-md transition-all bg-surface"
                              >
                                  <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-2">
                                              <TaskStatusBadge status={task.status} progress={task.progress} />
                                              <TaskTypeLabel type={task.type} />
                                          </div>
                                          <h4 className="font-medium text-text mb-1 truncate">
                                              {task.payload?.title || getTaskName(task.type)}
                                          </h4>
                                          <div className="flex items-center gap-4 text-xs text-text-tertiary">
                                              <span>创建: {new Date(task.created_at).toLocaleString()}</span>
                                              {task.scheduled_at && (
                                                  <span>计划: {new Date(task.scheduled_at).toLocaleString()}</span>
                                              )}
                                          </div>
                                          {task.status === 'FAILED' && task.error && (
                                              <div className="mt-2">
                                                  <FriendlyError
                                                  error={task.friendlyError || wrapError(task.error).friendly}
                                                  onRetry={() => openRetryConfirm(task)}
                                                  action={getErrorAction(task.friendlyError || wrapError(task.error).friendly)}
                                              />
                                              </div>
                                          )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                          {task.status === 'COMPLETED' && task.type === 'GENERATE_CONTENT' && (
                                              <button 
                                                  onClick={() => handleViewResult(task)} 
                                                  className="text-primary hover:text-primary-hover flex items-center text-xs font-medium bg-primary-subtle px-3 py-1.5 rounded"
                                              >
                                                  <Eye size={14} className="mr-1" /> 查看
                                              </button>
                                          )}
                                          {task.status === 'FAILED' && (
                                              <button 
                                                  onClick={() => openRetryConfirm(task)}
                                                  className="text-danger hover:text-danger flex items-center text-xs font-medium bg-danger-subtle px-3 py-1.5 rounded"
                                              >
                                                  <RotateCw size={14} className="mr-1" /> 重试
                                              </button>
                                          )}
                                          {(task.status === 'PENDING' || task.status === 'PROCESSING') && (
                                              <button 
                                                  onClick={() => handleCancel(task.id)}
                                                  className="text-text-secondary hover:text-text flex items-center text-xs font-medium bg-surface-muted px-3 py-1.5 rounded"
                                              >
                                                  <XCircle size={14} className="mr-1" /> 终止
                                              </button>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
                  
                  {/* Modal Footer */}
                  <div className="px-6 py-4 border-t border-border bg-surface-muted flex justify-end">
                      <button 
                          onClick={closeDayTasks}
                          className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface border border-border-strong rounded-md hover:bg-surface-muted transition-colors"
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
