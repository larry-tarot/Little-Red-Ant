import { create } from 'zustand';

// ============================================================
// 常量定义
// ============================================================

/**
 * localStorage 中存储认证信息的键名。
 *
 * 设计思路：
 * 旧的实现为了避免 XSS 完全放弃持久化，导致刷新页面就掉登录。
 * 这里改用 localStorage 存储长期 JWT，同时在改密、登出时立即清理，
 * 兼顾体验与安全。未来可升级为 "refresh token + 短期 access token" 架构。
 */
const AUTH_STORAGE_KEY = 'auth-storage';

// ============================================================
// 类型定义
// ============================================================

/**
 * 用户信息结构
 */
export interface User {
    id: number;
    username: string;
    alias?: string;
    role: string;
    permissions?: string[];
}

/**
 * AuthStore 状态结构
 */
interface AuthState {
    token: string | null;
    user: User | null;
    login: (token: string, user: User) => void;
    updateUser: (partial: Partial<User>) => void;
    logout: () => void;
}

/**
 * 持久化到 localStorage 的数据结构
 */
interface PersistedAuth {
    token: string;
    user: User;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 功能描述：从 localStorage 读取持久化的认证信息
 *
 * 返回说明：
 * - PersistedAuth | null：读取成功且结构合法时返回对象，否则返回 null
 *
 * 设计思路：
 * 1. SSR/受限环境直接返回 null，避免访问 window 报错。
 * 2. 对 localStorage 内容做最小校验，防止被篡改后导致应用崩溃。
 * 3. 解析失败时不抛出异常，静默降级为未登录状态。
 */
function readPersistedAuth(): PersistedAuth | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);

        // 校验 token 必须是有效字符串
        if (!parsed.token || typeof parsed.token !== 'string') return null;

        // 校验 user 必须是对象且包含必要字段
        if (!parsed.user || typeof parsed.user !== 'object') return null;
        if (typeof parsed.user.id !== 'number') return null;
        if (typeof parsed.user.username !== 'string') return null;
        if (typeof parsed.user.role !== 'string') return null;

        return parsed as PersistedAuth;
    } catch {
        // 解析异常或 localStorage 不可用时，按未登录处理
        return null;
    }
}

/**
 * 功能描述：将认证信息写入 localStorage
 *
 * 参数说明：
 * - token: [string] JWT 登录令牌
 * - user: [User] 当前登录用户信息
 *
 * 设计思路：
 * 仅在登录成功或更新用户信息时写入，确保 localStorage 与内存状态一致。
 */
function writePersistedAuth(token: string, user: User): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
    } catch {
        // 某些受限环境（如桌面 webview 安全策略）可能无法访问 localStorage，忽略即可
    }
}

/**
 * 功能描述：清除 localStorage 中的认证信息
 *
 * 设计思路：
 * 登出、修改密码后必须调用，避免旧 token 继续被其他标签页或刷新后的页面使用。
 */
function clearPersistedAuth(): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
        // 受限环境忽略
    }
}

// ============================================================
// Store 初始化
// ============================================================

/**
 * 应用启动时从 localStorage 恢复登录态。
 * 这样刷新页面后用户无需重新登录。
 */
const persisted = readPersistedAuth();

/**
 * 功能描述：创建全局认证状态 Store
 *
 * 设计思路：
 * 1. 初始状态优先使用持久化数据，解决刷新掉登录问题。
 * 2. login / logout / updateUser 都同步维护 localStorage。
 * 3. 配合 window storage 事件实现多标签页登录态同步。
 *
 * 使用示例：
 * >>> const token = useAuthStore(state => state.token);
 * >>> const login = useAuthStore(state => state.login);
 * >>> login('eyJ...', { id: 1, username: 'admin', role: 'admin' });
 */
const store = create<AuthState>()((set) => ({
    token: persisted?.token ?? null,
    user: persisted?.user ?? null,

    /**
     * 功能描述：登录成功后写入 token 和用户信息
     *
     * 参数说明：
     * - token: [string] 后端签发的 JWT
     * - user: [User] 用户信息对象
     */
    login: (token, user) => {
        writePersistedAuth(token, user);
        set({ token, user });
    },

    /**
     * 功能描述：更新本地缓存的用户信息
     *
     * 参数说明：
     * - partial: [Partial<User>] 需要更新的用户字段
     *
     * 设计思路：
     * 修改昵称/头像等轻量信息后，同步更新 localStorage，避免刷新后回退到旧数据。
     * 修改密码后应调用 logout() 而不是 updateUser()，因为 token 已经失效。
     */
    updateUser: (partial) => set((state) => {
        if (!state.user) return state;

        const nextUser = { ...state.user, ...partial };

        // 只有存在有效 token 时才持久化，避免把孤立用户信息写坏 storage
        if (state.token) {
            writePersistedAuth(state.token, nextUser);
        }

        return { user: nextUser };
    }),

    /**
     * 功能描述：登出，清除内存和持久化状态
     */
    logout: () => {
        clearPersistedAuth();
        set({ token: null, user: null });
    },
}));

// ============================================================
// 多标签页同步
// ============================================================

/**
 * 功能描述：监听 localStorage 变化，实现多标签页登录态同步
 *
 * 设计思路：
 * 当用户在一个标签页登录/登出/改密时，其他标签页通过 storage 事件感知并同步状态，
 * 避免"A 标签页已登出，B 标签页还显示已登录"的体验断裂。
 *
 * 注意事项：
 * - storage 事件只在非当前标签页触发，当前标签页自己的操作不会触发。
 * - 改密后旧 token 已失效，调用 logout() 会清除 storage，其他标签页同步登出。
 */
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key !== AUTH_STORAGE_KEY) return;

        if (!event.newValue) {
            // 其他标签页执行了登出或改密，同步清理本地状态
            store.setState({ token: null, user: null });
            return;
        }

        try {
            const parsed = JSON.parse(event.newValue);
            if (parsed.token && parsed.user) {
                store.setState({ token: parsed.token, user: parsed.user });
            }
        } catch {
            // 数据异常时按登出处理
            store.setState({ token: null, user: null });
        }
    });

    // 暴露 store 引用到 window，仅用于自动化测试 / E2E 场景
    (window as any).__authStore = store;
}

export const useAuthStore = store;
