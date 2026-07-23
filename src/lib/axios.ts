import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

// ============================================================
// baseURL 适配
// ============================================================
// Web 版(浏览器):走 vite proxy(/api/... → http://localhost:3001)
// 桌面版(Tauri):直接打 http://127.0.0.1:3001(sidecar 监听本地)
// ============================================================
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

if (isTauri) {
  // 桌面版:基础地址 = sidecar 后端地址
  // 127.0.0.1 比 localhost 稳定(避免某些 Windows 机器 DNS 解析慢)
  axios.defaults.baseURL = 'http://127.0.0.1:3001';
  // 不需要 withCredentials,token 在 Authorization header
} else {
  // Web 版:走 vite proxy(开发)或后端 host(生产)
  axios.defaults.baseURL = '';
}

export { isTauri };

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
            // Token expired or invalid
            // Avoid auto-logout which causes data loss. Warn user instead.
            console.warn('Unauthorized (401) detected. Token might be invalid.');
            
            // Only logout if we are not already on login page to avoid loops
            if (!window.location.pathname.includes('/login')) {
                 toast.error('系统登录状态可能已失效，请保存工作后重新登录。', { id: 'auth-error', duration: 5000 });
                 // useAuthStore.getState().logout(); // Disable auto-logout for stability
            }
        }
        return Promise.reject(error);
    }
);

export default axios;
