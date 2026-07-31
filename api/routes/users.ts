import { Router } from 'express';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import {
    CreateUserSchema,
    UpdateUserSchema,
    AdminResetPasswordSchema,
    UpdateUserStatusSchema,
    UpdateOwnProfileSchema,
    ChangePasswordSchema,
    IdParamSchema
} from '../schemas/index.js';
import { AdminUserService } from '../services/core/AdminUserService.js';
import { AuthService } from '../services/core/AuthService.js';

const router = Router();

// 所有路由都需要登录
router.use(authenticateToken);

// 当前登录用户自己的操作（不需要管理员权限）
// PUT /api/users/me — 修改自己的资料
router.put('/me', validateBody(UpdateOwnProfileSchema), (req: AuthRequest, res) => {
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

// PUT /api/users/me/password — 修改自己的密码
router.put('/me/password', validateBody(ChangePasswordSchema), async (req: AuthRequest, res) => {
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

// 以下路由需要管理员权限
router.use(requireAdmin);

// Get All Users
router.get('/', (_req, res) => {
    try {
        const users = AdminUserService.getAllAdminUsers();
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create User
router.post('/', validateBody(CreateUserSchema), async (req, res) => {
    const { username, password, role, alias, permissions } = req.body;
    try {
        const result = await AdminUserService.createAdminUser(username, password, role, alias, permissions);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({ success: true, id: result.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update User (alias / role / permissions)
router.put('/:id', validateParams(IdParamSchema), validateBody(UpdateUserSchema), (req, res) => {
    const id = req.params.id;
    const updates: { alias?: string; role?: string; permissions?: string[] } = {};
    if (req.body.alias !== undefined) updates.alias = req.body.alias;
    if (req.body.role !== undefined) updates.role = req.body.role;
    if (req.body.permissions !== undefined) updates.permissions = req.body.permissions;

    try {
        const result = AdminUserService.updateAdminUser(id, updates);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Reset User Password
router.post(
    '/:id/reset-password',
    validateParams(IdParamSchema),
    validateBody(AdminResetPasswordSchema),
    async (req, res) => {
        const id = req.params.id;
        const { newPassword } = req.body;
        try {
            const result = await AdminUserService.adminResetPassword(id, newPassword);
            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }
            res.json({ success: true, message: '密码已重置' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Toggle User Active Status
router.patch(
    '/:id/status',
    validateParams(IdParamSchema),
    validateBody(UpdateUserStatusSchema),
    (req: AuthRequest, res) => {
        const id = req.params.id;
        // 防止管理员把根管理员（id=1）停用导致无法恢复
        if (id === '1' && req.body.isActive === false) {
            return res.status(400).json({ error: '不能停用根管理员' });
        }
        // 防止管理员停用自己
        if (req.user && String(req.user.id) === String(id) && req.body.isActive === false) {
            return res.status(400).json({ error: '不能停用当前登录账号' });
        }
        const result = AdminUserService.setUserActive(id, req.body.isActive);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({ success: true });
    }
);

// Delete User
router.delete('/:id', validateParams(IdParamSchema), (req, res) => {
    try {
        const result = AdminUserService.deleteAdminUser(req.params.id);
        if (!result.success) {
            return res.status(403).json({ error: result.error });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
