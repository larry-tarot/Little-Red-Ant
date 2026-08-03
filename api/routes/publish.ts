import { Router } from 'express';
import { startCreatorLogin, getLoginState } from '../services/rpa/xiaohongshu.js';
import { enqueueTask } from '../services/queue.js';
import { VideoProjectService } from '../services/video/VideoProjectService.js';
import { AccountService } from '../services/core/AccountService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateBody } from '../middleware/validation.js';
import { PublishSchema } from '../schemas/index.js';
import { z } from 'zod';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOKIE_PATH = path.join(__dirname, '../../data/xhs_cookies.json');

/*
 * 跨账号批量发布的校验 schema
 */
const BatchPublishSchema = z.object({
    title: z.string().min(1, '标题不能为空').max(100, '标题过长'),
    content: z.string().min(1, '内容不能为空'),
    tags: z.array(z.string()).optional(),
    imageData: z.array(z.string()).optional(),
    accountIds: z.array(z.number()).min(1, '至少选择一个账号'),
    draftId: z.number().optional(),
});

// Check Login Status (File check + Memory state check)
router.get('/status', (_req, res) => {
  const isLoggedIn = fs.existsSync(COOKIE_PATH);
  const state = getLoginState();
  res.json({ 
    isLoggedIn,
    loginState: state.status,
    message: state.message
  });
});

// Start Login Process (Async) - Default to Creator Login
router.post('/login', async (_req, res) => {
  try {
    // Start background process for new account binding
    startCreatorLogin().catch(err => console.error('[Publish] Background login failed:', err)); 
    res.json({ success: true, message: 'Login process started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger Publish (Async Task Queue)
router.post('/publish', validateBody(PublishSchema), async (req, res) => {
  const { title, content, tags, imageData, videoPath, autoPublish, scheduledAt, accountId, projectId, draftId, contentType } = req.body;
  
  // Validation handled by middleware
  
  // Resolve video path if provided
  let resolvedVideoPath = videoPath;
  
  if (videoPath) {
      const publicDir = path.resolve(process.cwd(), 'public');
      
      // Check if it's a web-relative path (starts with /outputs or /uploads)
      // On Windows, path.isAbsolute('/outputs/...') returns true, so we need explicit check
      const normalizedPath = videoPath.replace(/\\/g, '/');
      
      if (normalizedPath.startsWith('/outputs/') || normalizedPath.startsWith('/uploads/')) {
          // It is a web-relative path -> resolve to filesystem path
          const relativePath = normalizedPath.substring(1); // Remove leading slash
          resolvedVideoPath = path.join(publicDir, relativePath);
      } else if (!path.isAbsolute(videoPath) && !videoPath.startsWith('http')) {
          // It is a relative path (e.g. "outputs/file.mp4") and not a URL
          resolvedVideoPath = path.join(publicDir, videoPath);
      }
      
      // Verify existence only if it's a local file (not HTTP)
      if (!videoPath.startsWith('http') && !fs.existsSync(resolvedVideoPath)) {
          return res.status(400).json({ error: `Video file not found: ${resolvedVideoPath}` });
      }
  }

  // [Pre-flight Check] REMOVED due to instability with Axios vs XHS Bot Protection.
  // We rely on the Worker (Puppeteer) to handle the session check during actual execution.
  // This prevents false negatives where Axios gets blocked but the browser would succeed.
  
  // 2. Asset Integrity Check (Basic)
  if (imageData && Array.isArray(imageData)) {
       // We could add logic here to check if local files exist, 
       // but most image data comes as Base64 or URLs which are handled in the worker.
  }

  try {
    const taskId = enqueueTask('PUBLISH', { 
        title, 
        content, 
        tags, 
        imageData,
        videoPath: resolvedVideoPath, // Pass resolved absolute path
        autoPublish, // Pass boolean
        accountId, // Pass target account
        projectId, // Pass projectId for status update
        draftId, // Pass draftId for status update
        contentType // Pass content type to worker
    }, scheduledAt); // Pass scheduledAt (optional)
    
    // Update Video Project Status immediately if projectId is present
    if (projectId) {
        VideoProjectService.updateProjectStatus(projectId, 'COMPLETED', undefined, 'PUBLISHING', taskId);
    }
    
    res.json({ success: true, taskId, message: scheduledAt ? 'Scheduled task queued' : 'Task queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 功能描述：跨账号批量分发 — 将同一份内容同时发布到多个账号
 *
 * 请求格式：
 * - POST /api/publish/batch
 * - body: { title, content, tags?, imageData?, accountIds: number[], draftId?: number }
 *
 * 返回说明：
 * - { success: true, tasks: { accountId: number, taskId: string }[] }
 *
 * 异常情况：
 * - 400: 参数校验失败或所有账号均无效
 * - 500: 任务入队失败
 */
router.post('/batch', async (req, res) => {
    try {
        const parsed = BatchPublishSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: '参数校验失败',
                details: parsed.error.issues
            });
        }

        const { title, content, tags, imageData, accountIds, draftId } = parsed.data;

        // 逐个验证账号是否存在且为活跃状态
        const accountStatuses: { accountId: number; valid: boolean; reason?: string }[] = [];
        for (const accountId of accountIds) {
            const account = AccountService.getAccountById(accountId);
            if (!account) {
                accountStatuses.push({ accountId, valid: false, reason: '账号不存在' });
            } else if (!account.is_active) {
                accountStatuses.push({ accountId, valid: false, reason: `账号 [${account.nickname}] 未激活` });
            } else {
                accountStatuses.push({ accountId, valid: true });
            }
        }

        const validIds = accountStatuses.filter(s => s.valid).map(s => s.accountId);
        if (validIds.length === 0) {
            return res.status(400).json({
                error: '没有可用的目标账号',
                details: accountStatuses.map(s => ({ accountId: s.accountId, reason: s.reason }))
            });
        }

        // 为每个有效账号入队一个 PUBLISH 任务
        const tasks: { accountId: number; taskId: string }[] = [];
        for (const accountId of validIds) {
            const taskId = enqueueTask('PUBLISH', {
                title,
                content,
                tags,
                imageData,
                accountId,
                draftId
            });
            tasks.push({ accountId, taskId });
        }

        res.json({
            success: true,
            tasks,
            skipped: accountStatuses.filter(s => !s.valid).map(s => ({
                accountId: s.accountId,
                reason: s.reason
            })),
            message: `已向 ${tasks.length} 个账号提交发布任务`
        });

    } catch (error: any) {
        console.error('[Publish] Batch publish error:', error);
        res.status(500).json({ error: error.message || '批量发布失败' });
    }
});

export default router;
