import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { isTauri } from './tauri';
import toast from 'react-hot-toast';

// ============================================================
// baseURL 适配 — 双源架构
// ============================================================
// Web 版(浏览器):走 vite proxy(/api/... → http://localhost:14753)
// 桌面版(Tauri):webview 加载 tauri://localhost(前端从 exe 内部嵌入),
//                axios 显式指向 http://127.0.0.1:14753(后端 sidecar 端口)
//                后端需要配置 CORS 允许 tauri://localhost 来源
// ============================================================
const BACKEND_PORT = 14753;
axios.defaults.baseURL = isTauri ? `http://127.0.0.1:${BACKEND_PORT}` : '';
// 允许跨域请求携带 cookie；即使当前主要使用内存 JWT，也为后续 httpOnly cookie 方案做准备。
axios.defaults.withCredentials = true;

// Request Interceptor
axios.interceptors.request.use(
    (config) => {
        const token = useAuthStore.getState().token;
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        // Check if this request specifically asked to skip global error handling
        if (error.config && error.config.skipAuthRefresh) {
            return Promise.reject(error);
        }

        if (error.response?.status === 401) {
            const msg = error.response?.data?.error || '';
            const isPasswordChanged = msg.includes('密码已修改') || msg.includes('重新登录');

            // 密码已修改 / 账号状态变更：必须重新登录
            if (isPasswordChanged && !window.location.pathname.includes('/login')) {
                toast.error(msg || '账号状态已变更，请重新登录', { id: 'auth-error', duration: 5000 });
                useAuthStore.getState().logout();
                window.location.href = '/login';
                return Promise.reject(error);
            }

            // 普通 401：提醒用户手动重新登录，避免自动登出导致数据丢失
            if (!window.location.pathname.includes('/login')) {
                 toast.error('系统登录状态可能已失效，请保存工作后重新登录。', { id: 'auth-error', duration: 5000 });
            }
        }
        return Promise.reject(error);
    }
);

export default axios;