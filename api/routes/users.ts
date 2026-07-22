import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { AdminUserService } from '../services/core/AdminUserService.js';

const router = Router();

// Middleware: All routes require Auth & Admin
router.use(authenticateToken);
router.use(requireAdmin);

// Get All Users
router.get('/', (req, res) => {
    try {
        const users = AdminUserService.getAllAdminUsers();
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create User
router.post('/', async (req, res) => {
    const { username, password, role, alias } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const result = await AdminUserService.createAdminUser(username, password, role, alias);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({ success: true, id: result.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update User (Role/Alias)
router.put('/:id', (req, res) => {
    const { role, alias } = req.body;
    try {
        AdminUserService.updateAdminUser(parseInt(req.params.id), role, alias);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete User
router.delete('/:id', (req, res) => {
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
