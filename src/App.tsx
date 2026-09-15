import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import axios from '@/lib/axios';
import Layout from '@/components/Layout';
import useTheme from '@/hooks/useTheme';
import { useAuthStore } from '@/store/useAuthStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AccountProvider } from '@/context/AccountContext';
import BackendBootGate from '@/components/BackendBootGate';

// Route-level code splitting: each page is a separate chunk, loaded on demand.
// The initial bundle drops from 2.5MB to ~300KB (core + layout + auth).
// Heavy pages (Analytics → recharts, TrendingGallery → xlsx) load only when visited.
const Home = lazy(() => import('@/pages/Home'));
const PersonaSetup = lazy(() => import('@/pages/PersonaSetup'));
const ContentGeneration = lazy(() => import('@/pages/ContentGeneration'));
const Drafts = lazy(() => import('@/pages/Drafts'));
const AccountManagement = lazy(() => import('@/pages/AccountManagement'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const ViralKnowledgePage = lazy(() => import('@/pages/ViralKnowledgePage'));
const Settings = lazy(() => import('@/pages/Settings'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const TrendingGalleryPage = lazy(() => import('@/pages/TrendingGalleryPage'));
const Engagement = lazy(() => import('@/pages/Engagement'));
const CompetitorMonitor = lazy(() => import('@/pages/CompetitorMonitor'));
const CompetitorAdd = lazy(() => import('@/pages/CompetitorAdd'));
const CompetitorDetail = lazy(() => import('@/pages/CompetitorDetail'));
const Login = lazy(() => import('@/pages/Login'));
const OpportunityHub = lazy(() => import('@/pages/OpportunityHub'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const UserManagement = lazy(() => import('@/pages/UserManagement'));
const Profile = lazy(() => import('@/pages/Profile'));
const VideoStudio = lazy(() => import('@/pages/VideoStudio'));
const VideoProjectList = lazy(() => import('@/pages/VideoProjectList'));
const AssetsLibrary = lazy(() => import('@/pages/AssetsLibrary'));
const NoteManagement = lazy(() => import('@/pages/NoteManagement'));
const PromptOptimizer = lazy(() => import('@/pages/PromptOptimizer'));
const TopicMining = lazy(() => import('@/pages/TopicMining'));

// Skeleton-ish fallback shown while a lazy-loaded page chunk is fetched.
// Matches the app's neutral palette so it doesn't flash.
function PageFallback() {
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-sm text-text-tertiary">加载中...</p>
            </div>
        </div>
    );
}

// 在 Router 内部暴露 navigate 函数，供自动化测试 / E2E 调用
function NavigationBridge() {
    const navigate = useNavigate();
    useEffect(() => {
        (window as any).__appNavigate = navigate;
    }, [navigate]);
    return null;
}

/**
 * 功能描述：应用启动时检查 JWT 是否临近过期，必要时调用 /auth/refresh 续期
 *
 * 设计思路：
 * 后端 JWT 默认已延长至 30 天，但如果用户连续使用多天，仍可能遇到 token
 * 过期。该组件在 Router 初始化后静默续期，避免用户在使用过程中被踢到登录页。
 */
function TokenRefresh() {
    const token = useAuthStore((state) => state.token);
    const login = useAuthStore((state) => state.login);
    const logout = useAuthStore((state) => state.logout);

    useEffect(() => {
        if (!token) return;

        let shouldRefresh = false;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = (payload.exp || 0) * 1000;
            // 过期前 24 小时内，或已经过期，都尝试续期
            shouldRefresh = exp > 0 && Date.now() >= exp - 24 * 60 * 60 * 1000;
        } catch {
            return;
        }

        if (!shouldRefresh) return;

        axios
            .post('/auth/refresh', {}, { skipAuthRefresh: true } as any)
            .then((res: any) => {
                if (res.data?.token) {
                    login(res.data.token, res.data.user);
                }
            })
            .catch(() => {
                // 续期失败且 token 已过期时，强制重新登录
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    if ((payload.exp || 0) * 1000 <= Date.now()) {
                        logout();
                    }
                } catch {
                    /* ignore */
                }
            });
    }, [token, login, logout]);

    return null;
}

// Protected Route Wrapper with Layout
const RequireAuth = ({ children, requiredPermission }: { children: JSX.Element, requiredPermission?: string }) => {
    const isAuthenticated = useAuthStore((state) => !!state.token);
    const user = useAuthStore((state) => state.user);
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Permission Check
    if (requiredPermission && user?.role !== 'admin') {
         const hasPermission = user?.permissions?.includes(requiredPermission);
         // Also check legacy role just in case
         if (!hasPermission) {
             return <Navigate to="/" replace />;
         }
    }

    return (
        <Layout>
            <AccountProvider>
                <ErrorBoundary>
                    {children}
                </ErrorBoundary>
            </AccountProvider>
        </Layout>
    );
};

function App() {
  useTheme();
  return (
    <BackendBootGate>
      <Router>
        <NavigationBridge />
        <TokenRefresh />
        <Toaster position="top-right" />
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />

              {/* Protected Routes */}
              <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
              <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/persona" element={<RequireAuth><PersonaSetup /></RequireAuth>} />
              <Route path="/opportunities" element={<RequireAuth><OpportunityHub /></RequireAuth>} />
              <Route path="/generate" element={<RequireAuth><ContentGeneration /></RequireAuth>} />
              <Route path="/video-studio/:id" element={<RequireAuth><VideoStudio /></RequireAuth>} />
              <Route path="/video-projects" element={<RequireAuth><VideoProjectList /></RequireAuth>} />
              <Route path="/assets" element={<RequireAuth><AssetsLibrary /></RequireAuth>} />
              <Route path="/drafts" element={<RequireAuth><Drafts /></RequireAuth>} />
              <Route path="/accounts" element={<RequireAuth><AccountManagement /></RequireAuth>} />
              <Route path="/analytics" element={<RequireAuth><Analytics /></RequireAuth>} />
              <Route path="/notes" element={<RequireAuth><NoteManagement /></RequireAuth>} />
              <Route path="/knowledge" element={<RequireAuth><ViralKnowledgePage /></RequireAuth>} />
              <Route path="/prompt-optimizer" element={<RequireAuth><PromptOptimizer /></RequireAuth>} />
              <Route path="/topic-mining" element={<RequireAuth><TopicMining /></RequireAuth>} />
              <Route path="/gallery" element={<RequireAuth><TrendingGalleryPage /></RequireAuth>} />

              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/tasks" element={<RequireAuth><Tasks /></RequireAuth>} />
              <Route path="/engagement" element={<RequireAuth><Engagement /></RequireAuth>} />
              <Route path="/competitor" element={<RequireAuth><CompetitorMonitor /></RequireAuth>} />
              <Route path="/competitor/add" element={<RequireAuth><CompetitorAdd /></RequireAuth>} />
              <Route path="/competitor/:id" element={<RequireAuth><CompetitorDetail /></RequireAuth>} />
              <Route path="/users" element={<RequireAuth requiredPermission="admin"><UserManagement /></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Router>
    </BackendBootGate>
  );
}

export default App;
