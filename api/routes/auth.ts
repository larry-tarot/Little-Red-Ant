import { Router } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import config from '../config.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import { AuthCredentialsSchema, ChangePasswordSchema, UpdateOwnProfileSchema } from '../schemas/index.js';
import { AuthService } from '../services/core/AuthService.js';
import { AdminUserService } from '../services/core/AdminUserService.js';
import { LoginAttemptService } from '../services/core/LoginAttemptService.js';

const router = Router();

// Register (Create Account) - Only for System Initialization
router.post('/register', validateBody(AuthCredentialsSchema), async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await AuthService.registerFirstAdmin(username, password);
        if (!result.success) {
            // 系统已初始化返回 403，用户名冲突返回 400
            const statusCode = result.error?.includes('already initialized') ? 403 : 400;
            return res.status(statusCode).json({ error: result.error });
        }
        // 与 /login 对齐:返回 token + user,前端 Login.tsx 同一份 handleSubmit 消费两路响应
        // info.lastInsertRowid 在 better-sqlite3 是 bigint,JSON 序列化前需 Number() 转,否则前端拿到字符串 id
        const userId = Number(result.userId);
        const token = jwt.sign(
            { id: userId, username, role: 'admin' },
            config.security.jwtSecret,
            { expiresIn: config.security.jwtExpiresIn as SignOptions['expiresIn'] }
        );
        res.json({
            success: true,
            token,
            user: { id: userId, username, role: 'admin' },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Login — 走 AuthService 统一校验（含 is_active、账号锁定检查）
router.post('/login', validateBody(AuthCredentialsSchema), async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await AuthService.login(username, password);
        if (!result.success || !result.user) {
            // 账号被锁定，直接返回 423 Locked
            if (result.error === 'ACCOUNT_LOCKED') {
                return res.status(423).json({
                    error: '账号已锁定，请稍后再试',
                    remainingSeconds: result.lockRemainingSeconds
                });
            }

            // 记录失败尝试（仅对真实账号才计数；避免被用于枚举时浪费计数器资源）
            if (result.error === 'INVALID_PASSWORD') {
                const lock = LoginAttemptService.recordFailure(username);
                if (lock.isLocked) {
                    return res.status(423).json({
                        error: '多次登录失败，账号已锁定',
                        remainingSeconds: lock.remainingSeconds
                    });
                }
            }

            if (result.error === 'ACCOUNT_DISABLED') {
                return res.status(403).json({ error: '账号已被停用，请联系管理员' });
            }
            // 用户不存在 / 密码错误都返回统一的 401，避免被用于用户名枚举
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        // 登录成功：清零失败计数
        LoginAttemptService.clear(username);

        const user = result.user;
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                alias: user.alias ?? undefined,
                role: user.role,
                passwordVersion: user.password_version
            },
            config.security.jwtSecret,
            { expiresIn: config.security.jwtExpiresIn as SignOptions['expiresIn'] }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                alias: user.alias,
                role: user.role,
                permissions: user.permissions
            }
        });
    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 功能描述：生成短期的 SSE 认证 Token
 *
 * 设计思路：
 * EventSource 无法设置 Authorization header，若把长期 JWT 直接拼在 URL query
 * 中，token 会被浏览器历史、代理日志、服务器 access log 记录，存在泄露风险。
 * 因此单独签发一个短期（5 分钟）、仅用于 SSE 连接的小权限 token，降低泄露后
 * 的影响面。
 */
const SSE_TOKEN_EXPIRES_IN = '5m';

function generateSseToken(user: NonNullable<AuthRequest['user']>) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            alias: user.alias,
            role: user.role,
            purpose: 'sse',
        },
        config.security.jwtSecret,
        { expiresIn: SSE_TOKEN_EXPIRES_IN }
    );
}

router.get('/sse-token', authenticateToken, (req: AuthRequest, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const sseToken = generateSseToken(req.user);
    res.json({ sseToken });
});

// Get Current User
router.get('/me', authenticateToken, (req: AuthRequest, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // 从 DB 读最新数据，确保 alias / role / is_active 与登录后变更同步
    const fresh = AdminUserService.getAdminUserById(req.user.id);
    if (!fresh) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: fresh });
});

/**
 * 功能描述：在 JWT 尚未过期时，用当前有效 token 换取新 token
 *
 * 设计思路：
 * 小红书 Cookie 有效期受平台控制，App 自身的 JWT 默认已延长至 30 天。
 * 为了进一步避免用户在使用过程中因 token 临近过期而被踢出，前端可在
 * token 过期前调用此接口续期。已过期的 token 无法续期，必须重新登录。
 */
router.post('/refresh', authenticateToken, (req: AuthRequest, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const fresh = AdminUserService.getAdminUserById(req.user.id);
    if (!fresh) {
        return res.status(404).json({ error: 'User not found' });
    }

    const token = jwt.sign(
        {
            id: fresh.id,
            username: fresh.username,
            alias: fresh.alias ?? undefined,
            role: fresh.role,
            passwordVersion: fresh.password_version
        },
        config.security.jwtSecret,
        { expiresIn: config.security.jwtExpiresIn as SignOptions['expiresIn'] }
    );

    res.json({ success: true, token, user: fresh });
});

/**
 * 功能描述：当前登录用户修改自己的密码
 *
 * 设计思路：
 * 1. 必须先校验旧密码正确，才能设新密码（防止会话被劫持后改密）。
 * 2. 成功后返回 success，前端提示用户重新登录（因为现有 token 仍有效但密码已变更）。
 *    如需强制下线其他设备，可后续加 token 黑名单。
 */
router.post('/change-password', authenticateToken, validateBody(ChangePasswordSchema), async (req: AuthRequest, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { oldPassword, newPassword } = req.body;
    try {
        const result = await AuthService.changeOwnPassword(req.user.id, oldPassword, newPassword);
        if (!result.success) {
            if (result.error === 'INVALID_OLD_PASSWORD') {
                return res.status(400).json({ error: '原密码错误' });
            }
            return res.status(400).json({ error: result.error || '修改失败' });
        }
        res.json({ success: true, message: '密码已更新，请使用新密码重新登录' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * 功能描述：当前登录用户修改自己的资料（目前只支持 alias）
 *
 * 安全说明：不允许用户通过此接口改自己的 role / permissions，避免越权。
 */
router.put('/profile', authenticateToken, validateBody(UpdateOwnProfileSchema), (req: AuthRequest, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { alias } = req.body;
    const updates: { alias?: string } = {};
    if (alias !== undefined) updates.alias = alias;

    const result = AdminUserService.updateAdminUser(req.user.id, updates);
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }
    const fresh = AdminUserService.getAdminUserById(req.user.id);
    res.json({ success: true, user: fresh });
});

// Init Check (Check if any admin exists)
router.get('/init-check', (_req, res) => {
    try {
        const hasUsers = AuthService.isSystemInitialized();
        res.json({ hasUsers });
    } catch (_error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Demo Mode Check (public, no auth required)
router.get('/demo-mode', async (_req, res) => {
    const { DemoService } = await import('../services/DemoService.js');
    const isDemo = await DemoService.isDemoMode();
    res.json({ demoMode: isDemo });
});

export default router;
