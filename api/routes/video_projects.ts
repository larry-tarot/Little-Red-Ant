import express from 'express';
import { VideoProjectService } from '../services/video/VideoProjectService.js';
import { VideoStitcher } from '../services/video/VideoStitcher.js';
import { TTSService } from '../services/audio/TTSService.js';
import { enqueueTask } from '../services/queue.js';
import { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

console.log('[DEBUG] Loading Video Project Routes...');

const stitcher = new VideoStitcher();
const ttsService = new TTSService();

/**
 * Sprint 8: Ownership guard — verifies that the authenticated user owns the project.
 * Returns 403 if not. This prevents IDOR (Insecure Direct Object Reference) attacks
 * where user A could read/delete user B's projects.
 * Legacy projects (created_by IS NULL) are accessible to all authenticated users
 * for backwards compatibility.
 */
function requireProjectOwner(req: AuthRequest, res: express.Response, next: express.NextFunction) {
    const projectId = req.params.id;
    if (!projectId) return res.status(400).json({ success: false, error: 'Project ID is required' });

    const project = VideoProjectService.getProject(projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Legacy projects: allow all authenticated users
    if (!project.created_by) return next();
    // Modern projects: verify ownership
    if (project.created_by !== req.user?.id) {
        return res.status(403).json({ success: false, error: 'Access denied: you do not own this project' });
    }
    next();
}

// Generate Audio for Scene
router.post('/scenes/:sceneId/audio', async (req: AuthRequest, res) => {
    try {
        const { text, voice } = req.body;
        const result = await ttsService.generate(text, voice);
        VideoProjectService.updateSceneAudio(req.params.sceneId, result.url, result.duration);
        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error('Audio Generation Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// List all projects
router.get('/', (req: AuthRequest, res) => {
    console.log('[DEBUG] GET /api/video-projects hit!');
    try {
        const projects = VideoProjectService.listProjects();
        res.json({ success: true, data: projects });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get project details
router.get('/:id', requireProjectOwner, (req: AuthRequest, res) => {
    try {
        const project = VideoProjectService.getProject(req.params.id);
        res.json({ success: true, data: project });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete project
router.delete('/:id', requireProjectOwner, (req: AuthRequest, res) => {
    try {
        VideoProjectService.deleteProject(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Project Character Description
router.patch('/:id/character', requireProjectOwner, (req: AuthRequest, res) => {
    try {
        const { character_desc } = req.body;
        if (character_desc === undefined) return res.status(400).json({ success: false, error: 'character_desc is required' });
        VideoProjectService.updateProjectCharacter(req.params.id, character_desc);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create project — now accepts created_by from authenticated user
router.post('/', (req: AuthRequest, res) => {
    try {
        const { title, script, character_desc, tags, description } = req.body;
        if (!title || !script) return res.status(400).json({ success: false, error: 'Missing title or script' });
        const project = VideoProjectService.createProject(title, script, character_desc, tags, description, req.user?.id);
        res.json({ success: true, data: project });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Scene Status (Callback or Manual)
router.patch('/scenes/:sceneId', (req: AuthRequest, res) => {
    try {
        const { status, videoUrl, taskId } = req.body;
        VideoProjectService.updateSceneStatus(req.params.sceneId, status, videoUrl, taskId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Project BGM
router.patch('/:id/bgm', requireProjectOwner, (req: AuthRequest, res) => {
    try {
        const { bgmUrl } = req.body;
        if (!bgmUrl) return res.status(400).json({ success: false, error: 'bgmUrl is required' });
        VideoProjectService.updateProjectBgm(req.params.id, bgmUrl);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stitch Videos
router.post('/:id/stitch', requireProjectOwner, async (req: AuthRequest, res) => {
    try {
        const project = VideoProjectService.getProject(req.params.id);
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        // Get completed scenes in order
        const validScenes = (project.scenes || []).filter(s => s.status === 'COMPLETED' && s.video_url);
        if (validScenes.length < 2) {
            return res.status(400).json({ success: false, error: 'Not enough completed scenes to stitch' });
        }

        const stitchScenes = validScenes.map(s => ({
            videoUrl: s.video_url!,
            audioUrl: s.audio_url
        }));

        // Enqueue Task
        const taskId = enqueueTask('VIDEO_STITCH', {
            projectId: project.id,
            scenes: stitchScenes,
            bgmUrl: project.bgm_url
        });

        VideoProjectService.updateProjectStatus(req.params.id, 'GENERATING');
        res.json({ success: true, taskId, message: 'Stitching task queued' });
    } catch (error: any) {
        console.error('Stitch API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;