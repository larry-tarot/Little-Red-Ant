import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import db from '../db.js';

export interface AuthRequest extends Request {
    user?: {
        id: number;
        username: string;
        alias?: string;
        role: string;
        permissions?: string[];
        passwordVersion?: number;
    };
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 1. Get Secret from Config
    const secret = config.security.jwtSecret;

    // 2. Get Token
    // Standard API requests use the Bearer header. SSE (EventSource) cannot set
    // headers, so we support a short-lived SSE token via query parameter to avoid
    // leaking the long-lived JWT in URLs, access logs and browser history.
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const sseToken = typeof req.query.sse_token === 'string' ? req.query.sse_token : undefined;
    const token = bearerToken || queryToken || sseToken;

    if (!token) {
        console.warn(`[Auth] Access denied: No token provided. Path: ${req.path}`);
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        // 3. Verify JWT
        const decoded = jwt.verify(token, secret) as any;

        // 4. SSE token scope restriction: short-lived SSE tokens must only be used
        // for SSE endpoints. Regular endpoints still require the standard JWT.
        if (decoded?.purpose === 'sse') {
            const isSseEndpoint = req.path.includes('/events') || req.path === '/active';
            const acceptHeader = req.headers['accept'] || '';
            if (!isSseEndpoint || !acceptHeader.includes('text/event-stream')) {
                console.warn(`[Auth] SSE token used outside SSE endpoint. Path: ${req.path}`);
                return res.status(403).json({ error: 'SSE token can only be used for SSE endpoints.' });
            }
        }

        // 5. 密码版本校验：若 token 在改密前签发，则拒绝并提示重新登录
        if (decoded?.passwordVersion !== undefined && decoded?.id) {
            const row = db.prepare('SELECT password_version, is_active FROM admin_users WHERE id = ?').get(decoded.id) as
                { password_version: number; is_active: number } | undefined;
            if (!row || row.is_active === 0) {
                return res.status(401).json({ error: '账号状态已变更，请重新登录' });
            }
            if (decoded.passwordVersion < row.password_version) {
                return res.status(401).json({ error: '密码已修改，请使用新密码重新登录' });
            }
        }

        req.user = decoded;
        next();
    } catch (err: any) {
        console.warn(`[Auth] Invalid token: ${err.message}. Path: ${req.path}`);
        return res.status(403).json({ error: 'Invalid token.' });
    }
};

export const requirePermission = (permission: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Admin has all permissions
        if (user.role === 'admin') {
            return next();
        }

        const userPermissions = user.permissions || [];
        if (userPermissions.includes(permission)) {
            return next();
        }

        return res.status(403).json({ error: `Permission denied: Requires ${permission}` });
    };
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.role === 'admin') {
        return next();
    }

    return res.status(403).json({ error: 'Permission denied: Admin role required' });
};
