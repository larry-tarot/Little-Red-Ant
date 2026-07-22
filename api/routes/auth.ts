import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import config from '../config.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { AuthService } from '../services/core/AuthService.js';

const router = Router();

// Register (Create Account) - Only for System Initialization
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const result = await AuthService.registerFirstAdmin(username, password);
        if (!result.success) {
            // 系统已初始化返回 403，用户名冲突返回 400
            const statusCode = result.error?.includes('already initialized') ? 403 : 400;
            return res.status(statusCode).json({ error: result.error });
        }
        res.json({ success: true, message: 'Admin registered successfully', userId: result.userId });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as any;
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 生成 JWT Token（有效期 7 天）
        const secret = config.security.jwtSecret;
        const token = jwt.sign(
            { id: user.id, username: user.username, alias: user.alias, role: user.role },
            secret,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username, alias: user.alias, role: user.role }
        });

    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Current User
router.get('/me', authenticateToken, (req: AuthRequest, res) => {
    res.json({ user: req.user });
});

// Init Check (Check if any admin exists)
router.get('/init-check', (req, res) => {
    try {
        const hasUsers = AuthService.isSystemInitialized();
        res.json({ hasUsers });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Demo Mode Check (public, no auth required)
router.get('/demo-mode', async (req, res) => {
    const { DemoService } = await import('../services/DemoService.js');
    const isDemo = await DemoService.isDemoMode();
    res.json({ demoMode: isDemo });
});

export default router;
