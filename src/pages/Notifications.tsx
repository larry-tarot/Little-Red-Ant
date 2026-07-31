import { Bell, CheckCircle, AlertTriangle, Info, Clock, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from '@/lib/axios';
import { useSafeAsync } from '../hooks/useSafeAsync';
import toast from 'react-hot-toast';
import { useState, useEffect } from "react";

interface Notification {
  id: number;
  type: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { isMounted, safeRequest } = useSafeAsync();

  useEffect(() => {
    fetchNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await safeRequest((signal: AbortSignal) => axios.get('/api/notifications', { signal }));
      if (res && res.data) {
          setNotifications(res.data);
      }
    } catch (_error) {
      toast.error('通知加载失败');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await axios.put(`/api/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (_error) {
      toast.error('操作失败');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('全部已读');
    } catch (_error) {
      toast.error('操作失败');
    }
  };

  const formatTime = (isoString: string) => {
      const date = new Date(isoString);
      return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Link to="/" className="mr-4 p-2 rounded-full hover:bg-surface-hover transition-colors">
                <ArrowLeft className="w-6 h-6 text-text-secondary" />
            </Link>
            <h1 className="text-2xl font-bold text-text flex items-center">
                <Bell className="mr-2 text-primary" />
                消息通知 (Notifications)
            </h1>
          </div>
          <button 
            onClick={handleMarkAllRead}
            className="text-sm text-primary hover:text-primary-hover flex items-center bg-surface px-3 py-1.5 rounded border border-primary-subtle hover:bg-primary-subtle transition-colors"
          >
            <Check size={16} className="mr-1" /> 全部已读
          </button>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden min-h-[400px]">
          {loading ? (
             <div className="flex justify-center items-center h-64">
                 <Loader2 className="animate-spin text-primary" size={32} />
             </div>
          ) : (
             <div className="divide-y divide-border">
                {notifications.map((note) => (
                <div 
                    key={note.id} 
                    onClick={() => !note.is_read && handleMarkRead(note.id)}
                    className={`p-4 hover:bg-surface-muted transition-colors flex items-start cursor-pointer ${!note.is_read ? 'bg-primary-subtle/40' : ''}`}
                >
                    <div className="flex-shrink-0 mr-4 mt-1">
                    {note.type === 'SUCCESS' && <CheckCircle className="text-success" size={24} />}
                    {note.type === 'WARNING' && <AlertTriangle className="text-warning" size={24} />}
                    {note.type === 'ERROR' && <AlertTriangle className="text-danger" size={24} />}
                    {note.type === 'INFO' && <Info className="text-primary" size={24} />}
                    </div>
                    <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <h3 className={`text-sm font-bold ${!note.is_read ? 'text-text' : 'text-text-secondary'}`}>
                        {note.title}
                        {!note.is_read && <span className="ml-2 inline-block w-2 h-2 bg-danger rounded-full animate-pulse"></span>}
                        </h3>
                        <span className="text-xs text-text-tertiary flex items-center whitespace-nowrap ml-4">
                        <Clock size={12} className="mr-1" />
                        {formatTime(note.created_at)}
                        </span>
                    </div>
                    <p className={`text-sm mt-1 ${!note.is_read ? 'text-text' : 'text-text-tertiary'}`}>
                        {note.message}
                    </p>
                    </div>
                </div>
                ))}
                {notifications.length === 0 && (
                    <div className="p-12 text-center text-text-tertiary flex flex-col items-center">
                        <Bell size={48} className="text-text-tertiary mb-4" />
                        <p>暂无新消息</p>
                    </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
