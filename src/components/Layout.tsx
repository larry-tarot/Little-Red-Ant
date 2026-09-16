import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, Home, PenTool, Layout as LayoutIcon,
  MessageSquare, Target, FileText, BarChart, PlayCircle, Settings, ShieldCheck, Bell, ChevronLeft, ChevronRight, Flame, Database, Library, Search, Lightbulb, Layers, Radio
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import axios from '@/lib/axios';
import { isTauri } from '../lib/tauri';
import TaskMonitor from './TaskMonitor';
import DemoBanner from './DemoBanner';
import TitleBar from './TitleBar';
import AIPanel from './AIPanel';
import StatusBar from './StatusBar';
import Modal from './Modal';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * 全局布局组件
 *
 * 包含：桌面端自定义标题栏、侧边栏、主内容区、AI 助手面板（桌面版）、状态栏（桌面版）。
 * 所有样式基于 design tokens，支持亮色/暗色主题。
 */
export default function Layout({ children }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore(state => state.logout);
  const user = useAuthStore(state => state.user);

  // 拉取未读通知数
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await axios.get('/api/notifications');
        if (res.data && Array.isArray(res.data)) {
          const count = res.data.filter((n: any) => !n.is_read).length;
          setUnreadCount(count);
        }
      } catch (_e) {
        // Silent error
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  // 菜单分组
  const menuGroups = [
    {
      title: '创作中心',
      items: [
        { title: '首页', icon: Home, path: '/' },
        { title: '需求雷达', icon: Radio, path: '/radar' },
        { title: '选题机会池', icon: Lightbulb, path: '/opportunities' },
        { title: '内容包工作台', icon: Layers, path: '/packages' },
        { title: '智能创作', icon: PenTool, path: '/generate' },
        { title: '视频工程', icon: PlayCircle, path: '/video-projects' },
        { title: '素材库', icon: Library, path: '/assets' },
        { title: '草稿箱', icon: FileText, path: '/drafts' },
      ]
    },
    {
      title: '爆款库',
      items: [
        { title: '发现爆款', icon: Flame, path: '/gallery' },
        { title: '选题挖掘', icon: Search, path: '/topic-mining' },
        { title: '我的爆款', icon: Database, path: '/knowledge' },
      ]
    },
    {
      title: '运营分析',
      items: [
        { title: '笔记管理', icon: FileText, path: '/notes' },
        { title: '竞品监控', icon: Target, path: '/competitor' },
        { title: '数据看板', icon: BarChart, path: '/analytics' },
        { title: '互动中心', icon: MessageSquare, path: '/engagement' },
      ]
    },
    {
      title: '系统管理',
      items: [
        { title: '账号矩阵', icon: LayoutIcon, path: '/accounts' },
        { title: '任务中心', icon: PlayCircle, path: '/tasks' },
        { title: '权限管理', icon: ShieldCheck, path: '/users', requiredRole: 'admin' },
        { title: '系统设置', icon: Settings, path: '/settings', requiredRole: 'admin' },
      ]
    }
  ];

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    logout();
    navigate('/login');
    setShowLogoutConfirm(false);
  };

  const isActive = (path: string) => location.pathname === path;

  // 根据角色过滤菜单
  const getFilteredMenuGroups = () => {
    if (!user) return [];
    const userRole = user.role || 'editor';

    return menuGroups.map(group => ({
      ...group,
      items: group.items.filter((item: any) => {
        if (item.requiredRole === 'admin' && userRole !== 'admin') {
          return false;
        }
        return true;
      })
    })).filter(group => group.items.length > 0);
  };

  const filteredGroups = getFilteredMenuGroups();

  return (
    <div className={`h-screen bg-surface-elevated flex flex-col ${isTauri ? 'pt-10' : ''}`}>
      {/* 桌面版自定义标题栏 — 内部判断 isTauri，Web 端自动返回 null */}
      <TitleBar />

      {/* 退出确认弹窗 */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="确认退出？"
        footer={
          <div className="flex space-x-3">
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="flex-1 px-4 py-2 bg-surface-muted text-text rounded-lg hover:bg-surface-hover font-medium transition-colors"
            >
              取消
            </button>
            <button
              onClick={confirmLogout}
              className="flex-1 px-4 py-2 bg-danger text-primary-text rounded-lg hover:bg-danger/90 font-medium transition-colors"
            >
              确认退出
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-danger-subtle mx-auto mb-4">
            <LogOut className="text-danger" size={24} />
          </div>
          <p className="text-sm text-text-secondary">
            退出后您需要重新登录才能管理账号。
          </p>
        </div>
      </Modal>

      {/* 移动端顶部栏 — Web 端专用 */}
      {!isTauri && (
        <div className="md:hidden bg-primary p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
          <div className="flex items-center font-bold text-primary-text">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center mr-2 text-lg">
              🐜
            </div>
            小红蚁
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 text-primary-text/80 hover:bg-white/20 rounded-full relative transition-colors">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-primary"></span>
              )}
            </button>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-primary-text p-1">
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      )}

      {/* 内容区：侧边栏 + 主内容 + AI 面板 */}
      <div className={`flex flex-1 overflow-hidden ${isTauri ? 'flex-row' : 'flex-col md:flex-row'}`}>
        {/* 侧边栏 */}
        <div className={`
          fixed inset-y-0 left-0 z-30 bg-surface border-r border-border transform transition-all duration-200 ease-in-out
          md:relative md:translate-x-0
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isSidebarCollapsed ? 'w-20' : 'w-64'}
        `}>
          <div className="h-full flex flex-col relative">
            {/* 折叠按钮（桌面端） */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:flex absolute -right-3 top-10 bg-surface border border-border rounded-full p-1 text-text-tertiary hover:text-text shadow-sm z-50 transition-colors"
            >
              {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {/* Logo */}
            <div className="p-6 border-b border-border hidden md:flex items-center justify-between h-20 bg-surface-elevated">
              <div className="flex items-center justify-center w-full">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-text font-bold flex-shrink-0 shadow-md text-lg">
                  🐜
                </div>
                {!isSidebarCollapsed && <span className="text-xl font-bold text-text ml-3 whitespace-nowrap overflow-hidden">小红蚁</span>}
              </div>
            </div>

            {/* 用户信息摘要 */}
            <div className={`bg-surface-elevated border-b border-border flex items-center ${isSidebarCollapsed ? 'justify-center p-2' : 'justify-between p-4'}`}>
              <Link
                to="/profile"
                className="flex items-center min-w-0 hover:opacity-80 transition-opacity"
                title="个人中心"
              >
                <div className="w-9 h-9 rounded-full bg-primary text-primary-text flex items-center justify-center font-bold flex-shrink-0 shadow-sm">
                  {user?.username?.charAt(0).toUpperCase() || 'A'}
                </div>
                {!isSidebarCollapsed && (
                  <div className="min-w-0 ml-3">
                    <p className="text-sm font-medium text-text truncate max-w-[100px]">{user?.username || 'Admin'}</p>
                    <p className="text-xs text-text-secondary truncate capitalize">{user?.role === 'admin' ? '管理员' : '编辑'}</p>
                  </div>
                )}
              </Link>
              {/* 桌面端通知铃铛 */}
              {!isSidebarCollapsed && (
                <Link to="/notifications" className="p-1.5 text-text-tertiary hover:text-primary hover:bg-primary-subtle rounded-full relative transition-colors">
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-danger rounded-full ring-2 ring-surface"></span>
                  )}
                </Link>
              )}
            </div>

            {/* 导航菜单 */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-6">
              {filteredGroups.map((group, groupIdx) => (
                <div key={groupIdx}>
                  {!isSidebarCollapsed && (
                    <h3 className="px-4 text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                      {group.title}
                    </h3>
                  )}
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        title={isSidebarCollapsed ? item.title : ''}
                        className={`
                          flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200
                          ${isActive(item.path)
                            ? 'bg-primary-subtle text-primary shadow-sm'
                            : 'text-text-secondary hover:bg-surface-muted hover:text-text'}
                          ${isSidebarCollapsed ? 'justify-center' : ''}
                        `}
                      >
                        <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive(item.path) ? 'text-primary' : 'text-text-tertiary'} ${!isSidebarCollapsed ? 'mr-3' : ''}`} />
                        {!isSidebarCollapsed && item.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            {/* 底部操作 */}
            <div className="p-4 border-t border-border bg-surface-elevated">
              <button
                onClick={handleLogoutClick}
                className={`flex items-center w-full px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-danger hover:bg-danger-subtle rounded-xl transition-all duration-200 ${isSidebarCollapsed ? 'justify-center' : ''}`}
                title={isSidebarCollapsed ? '退出登录' : ''}
              >
                <LogOut className={`h-5 w-5 flex-shrink-0 ${!isSidebarCollapsed ? 'mr-3' : ''}`} />
                {!isSidebarCollapsed && '退出登录'}
              </button>
            </div>
          </div>
        </div>

        {/* 移动端遮罩 */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-20 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* 主内容区：侧边栏已在文档流中，无需额外 margin；内容左对齐避免与侧边栏出现大片空白 */}
        <main className="flex-1 overflow-auto w-full transition-all duration-200">
          <DemoBanner />
          <div className="w-full md:p-8 p-4">
            {children}
          </div>
        </main>

        {/* AI 面板 — 桌面版 */}
        {isTauri && <AIPanel />}
      </div>

      {/* 状态栏 — 桌面版 */}
      {isTauri && <StatusBar />}

      {/* 全局任务监控 */}
      <TaskMonitor />
    </div>
  );
}
