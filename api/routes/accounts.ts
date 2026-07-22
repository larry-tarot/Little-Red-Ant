import { Router } from 'express';
import { AccountService } from '../services/core/AccountService.js';
import { startCreatorLogin, startMainSiteLogin, getLoginState, openNoteInBrowser } from '../services/rpa/xiaohongshu.js';
import { checkAllAccountsHealth as checkHealth } from '../services/rpa/auth.js';
import { enqueueTask } from '../services/queue.js';
import fs from 'fs';
import path from 'path';

const router = Router();

// Open Note in RPA Browser
router.post('/open-note', async (req, res) => {
  const { noteId } = req.body;
  if (!noteId) return res.status(400).json({ error: 'noteId is required' });
  
  try {
    await openNoteInBrowser(noteId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all accounts
router.get('/', (req, res) => {
  try {
    const result = AccountService.getAllAccounts();
    res.json(result);
  } catch (error: any) {
    console.error('Fetch accounts error:', error);
    res.status(500).json({ error: `Failed to fetch accounts: ${error.message}` });
  }
});

// Update Account Alias
router.put('/:id/alias', (req, res) => {
    try {
        const { alias } = req.body;
        AccountService.updateAlias(req.params.id, alias);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update Account Persona
router.put('/:id/persona', (req, res) => {
    try {
        const { niche, persona_desc, tone, writing_sample } = req.body;
        AccountService.updatePersona(req.params.id, { niche, persona_desc, tone, writing_sample });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger Manual Health Check
router.post('/check-health', async (req, res) => {
    try {
        const taskId = enqueueTask('CHECK_HEALTH', {});
        res.json({ success: true, taskId, message: 'Health check queued' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Start Creator Login Process (Publishing/Stats)
router.post('/login', async (req, res) => {
  try {
    const { accountId } = req.body;
    await startCreatorLogin(accountId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start Main Site Login Process (Browsing)
router.post('/login-main', async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'Account ID is required for binding browsing permission' });
    await startMainSiteLogin(accountId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check Login Status (Polling)
router.get('/status', (req, res) => {
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
router.get('/primary-status', (req, res) => {
    try {
        const account = AccountService.getPrimaryStatus();
        if (!account) return res.status(404).json({ error: 'No active account' });
        res.json(account);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Switch Active Account
router.post('/:id/active', (req, res) => {
  try {
    AccountService.switchActiveAccount(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to switch account' });
  }
});

// Delete Account
router.delete('/:id', (req, res) => {
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
