import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

// ============================================================
// baseURL 适配
// ============================================================
// 浏览器(web):请求走 vite proxy(/api/... -> http://localhost:3001)
// 桌面(electron):直接打 http://localhost:3001
// ============================================================
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

if (isElectron) {
  // 桌面版:基础地址 = 后端地址(同进程)
  // 注意:这里用相对路径也可以,因为 renderer 和后端在同一个 origin
  // 但为保险起见,显式写明
  axios.defaults.baseURL = `http://localhost:3001`;
  // 不需要 withCredentials,token 在 Authorization header
} else {
  // Web 版:走 vite proxy(开发)或后端 host(生产)
  axios.defaults.baseURL = '';
}

// ============================================================
// Request Interceptor
// ============================================================
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

// ============================================================
// Response Interceptor
// ============================================================
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.config && error.config.skipAuthRefresh) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      console.warn('Unauthorized (401) detected. Token might be invalid.');
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        toast.error('系统登录状态可能已失效,请保存工作后重新登录。', {
          id: 'auth-error',
          duration: 5000,
        });
      }
    }
    return Promise.reject(error);
  }
);

export default axios;
