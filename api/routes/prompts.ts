import { Router } from 'express';
import { PromptService } from '../services/core/PromptService.js';

const router = Router();

// Get all templates
router.get('/', (req, res) => {
    try {
        const list = PromptService.getAllTemplates();
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create new template
router.post('/', (req, res) => {
    const { name, description, template } = req.body;
    if (!name || !template) return res.status(400).json({ error: 'Name and template are required' });

    try {
        const id = PromptService.createTemplate(name, description, template);
        res.json({ success: true, id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete template
router.delete('/:id', (req, res) => {
    try {
        // 保护默认模板禁止删除
        const tpl = PromptService.getTemplateDefaultFlag(req.params.id);
        if (tpl && tpl.is_default) {
            return res.status(403).json({ error: 'Cannot delete default templates' });
        }

        PromptService.deleteTemplate(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
