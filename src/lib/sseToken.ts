import axios from './axios.js';

/**
 * 功能描述：获取短期的 SSE 认证 Token
 *
 * 设计思路：
 * EventSource 无法设置 Authorization header，直接把长期 JWT 拼在 URL 上会
 * 被浏览器历史、代理日志、服务器 access log 记录。这里向后端申请一个
 * 5 分钟有效期的专用 SSE token，仅用于 EventSource 连接。
 *
 * 返回说明：
 * - Promise<string> SSE token，失败时抛出异常
 */
export async function fetchSseToken(): Promise<string> {
    const res = await axios.get('/api/auth/sse-token');
    if (!res.data?.sseToken) {
        throw new Error('后端未返回 SSE token');
    }
    return res.data.sseToken as string;
}
