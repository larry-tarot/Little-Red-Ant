import { Router } from 'express';
import { AccountService } from '../services/core/AccountService.js';
import { startCreatorLogin, startMainSiteLogin, getLoginState, openNoteInBrowser, refreshQrCode } from '../services/rpa/xiaohongshu.js';
import { enqueueTask } from '../services/queue.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import {
    OpenNoteSchema,
    UpdateAliasSchema,
    UpdatePersonaSchema,
    AccountLoginSchema,
    IdParamSchema
} from '../schemas/index.js';
import fs from 'fs';
const router = Router();

// Open Note in RPA Browser
router.post('/open-note', validateBody(OpenNoteSchema), async (req, res) => {
  const { noteId } = req.body;
  
  try {
    await openNoteInBrowser(noteId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all accounts
router.get('/', (_req, res) => {
  try {
    const result = AccountService.getAllAccounts();
    res.json(result);
  } catch (error: any) {
    console.error('Fetch accounts error:', error);
    res.status(500).json({ error: `Failed to fetch accounts: ${error.message}` });
  }
});

// Update Account Alias
router.put('/:id/alias', validateParams(IdParamSchema), validateBody(UpdateAliasSchema), (req, res) => {
    try {
        const { alias } = req.body;
        AccountService.updateAlias(req.params.id, alias);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update Account Persona
router.put('/:id/persona', validateParams(IdParamSchema), validateBody(UpdatePersonaSchema), (req, res) => {
    try {
        const { niche, persona_desc, tone, writing_sample } = req.body;
        AccountService.updatePersona(req.params.id, { niche, persona_desc, tone, writing_sample });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger Manual Health Check
router.post('/check-health', async (_req, res) => {
    try {
        const taskId = enqueueTask('CHECK_HEALTH', {});
        res.json({ success: true, taskId, message: 'Health check queued' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Start Creator Login Process (Publishing/Stats)
router.post('/login', validateBody(AccountLoginSchema), async (req, res) => {
  try {
    const { accountId } = req.body;
    // 登录过程耗时较长（扫码 + 浏览器轮询），改为后台执行并立即返回，
    // 前端通过 /status 轮询获取二维码和登录状态。
    startCreatorLogin(accountId).catch((error: any) => {
      console.error('Creator login background error:', error);
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start Main Site Login Process (Browsing)
router.post('/login-main', validateBody(AccountLoginSchema), async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'Account ID is required for binding browsing permission' });
    // 登录过程耗时较长（扫码 + 浏览器轮询），改为后台执行并立即返回，
    // 前端通过 /status 轮询获取二维码和登录状态。
    startMainSiteLogin(accountId).catch((error: any) => {
      console.error('Main site login background error:', error);
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh QR Code during login
router.post('/refresh-qr', async (_req, res) => {
  try {
    const result = await refreshQrCode();
    if (result.success) {
      res.json({ success: true, qrCodeUrl: result.qrCodeUrl });
    } else {
      res.status(400).json({ success: false, message: result.message, qrCodeUrl: result.qrCodeUrl });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check Login Status (Polling)
router.get('/status', (_req, res) => {
  const state = getLoginState();
  const { activeAccount } = AccountService.getLoginStatus();
  
  res.json({ 
    loginState: state.status,
    loginType: state.type,
    message: state.message,
    qrCodeUrl: state.qrCodeUrl,
    activeAccount
  });
});

// Get Primary Account Status for Badge
router.get('/primary-status', (_req, res) => {
    try {
        const account = AccountService.getPrimaryStatus();
        if (!account) return res.status(404).json({ error: 'No active account' });
        res.json(account);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Switch Active Account
router.post('/:id/active', validateParams(IdParamSchema), (req, res) => {
  try {
    AccountService.switchActiveAccount(req.params.id);
    res.json({ success: true });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to switch account' });
  }
});

// Delete Account
router.delete('/:id', validateParams(IdParamSchema), (req, res) => {
  try {
    const accountId = req.params.id;
    
    const { profile_path } = AccountService.deleteAccount(accountId);

    // 5. Delete profile directory if exists
    if (profile_path) {
        try {
            if (fs.existsSync(profile_path)) {
                fs.rmSync(profile_path, { recursive: true, force: true });
            }
        } catch (fsError) {
            console.error('Failed to delete profile directory:', fsError);
        }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: `Failed to delete account: ${error.message}` });
  }
});

export default router;
