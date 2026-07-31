import { Router } from 'express';
import { UserService } from '../services/core/UserService.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import {
    PersonaCreateSchema,
    PersonaUpdateSchema,
    PersonaIdParamSchema,
} from '../schemas/index.js';

const router = Router();

// Get Active Persona (Backward Compatibility)
router.get('/', (_req, res) => {
    try {
        const persona = UserService.getActivePersona();
        res.json(persona);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// Get All Personas
router.get('/list', (_req, res) => {
    try {
        const personas = UserService.getAllPersonas();
        res.json(personas);
    } catch (_e) {
        res.status(500).json({ error: 'Failed to list personas' });
    }
});

// Create New Persona
router.post('/', validateBody(PersonaCreateSchema), (req, res) => {
    const { name, niche, identity_tags, style, benchmark_accounts, writing_samples } = req.body;

    try {
        const result = UserService.createPersona({
            name,
            niche,
            identity_tags,
            style,
            benchmark_accounts,
            writing_samples
        });
        res.json(result);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create persona' });
    }
});

// Update Persona
router.put('/:id', validateParams(PersonaIdParamSchema), validateBody(PersonaUpdateSchema), (req, res) => {
    const { id } = req.params;
    const { name, niche, identity_tags, style, benchmark_accounts, writing_samples } = req.body;

    try {
        UserService.updatePersona(parseInt(id), {
            name,
            niche,
            identity_tags,
            style,
            benchmark_accounts,
            writing_samples
        });
        res.json({ success: true });
    } catch (_e) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Activate Persona
router.post('/:id/activate', validateParams(PersonaIdParamSchema), (req, res) => {
    const { id } = req.params;
    try {
        UserService.activatePersona(parseInt(id));
        res.json({ success: true });
    } catch (_e) {
        res.status(500).json({ error: 'Activation failed' });
    }
});

// Delete Persona
router.delete('/:id', validateParams(PersonaIdParamSchema), (req, res) => {
    const { id } = req.params;
    try {
        UserService.deletePersona(parseInt(id));
        res.json({ success: true });
    } catch (_e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

export default router;
