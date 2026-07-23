import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Toaster } from 'react-hot-toast';
import Layout from '@/components/Layout';
import TitleBar from '@/components/TitleBar';
import useTheme from '@/hooks/useTheme';
import { useAuthStore } from '@/store/useAuthStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AccountProvider } from '@/context/AccountContext';

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
const Notifications = lazy(() => import('@/pages/Notifications'));
const UserManagement = lazy(() => import('@/pages/UserManagement'));
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
                <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-sm text-gray-400">加载中...</p>
            </div>
        </div>
    );
}

// Protected Route Wrapper with Layout
const RequireAuth = ({ children, requiredPermission }: { children: JSX.Element, requiredPermission?: string }) => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const user = useAuthStore((state) => state.user);
    const location = useLocation();

    if (!isAuthenticated()) {
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
    <Router>
      <TitleBar />
      <Toaster position="top-right" />
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Protected Routes */}
            <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
            <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/persona" element={<RequireAuth><PersonaSetup /></RequireAuth>} />
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
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
