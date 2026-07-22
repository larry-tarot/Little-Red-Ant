import express from 'express';
import { upload, AssetService } from '../services/asset/AssetService.js';

const router = express.Router();

/**
 * 检查 URL 是否指向内网地址（防止 SSRF 攻击）
 */
function isInternalUrl(urlStr: string): boolean {
    try {
        const url = new URL(urlStr);
        const hostname = url.hostname.toLowerCase();
        
        // 检查 localhost 和 IPv6 localhost
        if (hostname === 'localhost' || hostname === '[::1]' || hostname === '0.0.0.0') return true;
        
        // 检查 IPv4 内网地址
        const parts = hostname.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => !isNaN(p))) {
            if (parts[0] === 10) return true; // 10.0.0.0/8
            if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
            if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
            if (parts[0] === 127) return true; // 127.0.0.0/8
            if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (Link-local)
            if (parts[0] === 0) return true; // 0.0.0.0/8
        }
        
        return false;
    } catch (e) {
        return true; // 如果 URL 解析失败，视为不安全
    }
}

// Generic Upload Handler
router.post('/upload/:type', upload.single('file'), (req, res) => {
    try {
        const { type } = req.params;
        if (!['audio', 'image', 'video'].includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid asset type' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded or file type not allowed' });
        }
        
        const asset = AssetService.saveAssetRecord(req.file, type as 'audio' | 'image' | 'video');
        res.json({ success: true, data: asset });
    } catch (error: any) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Proxy Endpoint for Image Loading
router.get('/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).send('URL is required');
    }

    // SSRF 防护：禁止访问内网地址
    if (isInternalUrl(url)) {
        console.error(`[Proxy] Blocked internal URL access attempt: ${url}`);
        return res.status(403).send('Access to internal resources is forbidden');
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url, {
            headers: {
                'Referer': 'https://www.xiaohongshu.com/', // Fake referer
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        // 安全增强：检查响应的 MIME 类型，只允许图片和视频
        const contentType = response.headers.get('content-type') || '';
        const allowedTypes = ['image/', 'video/', 'audio/'];
        if (!allowedTypes.some(t => contentType.startsWith(t))) {
            console.error(`[Proxy] Blocked non-media content type: ${contentType}`);
            return res.status(403).send('Only media content is allowed');
        }
        
        res.setHeader('Content-Type', contentType);
        
        // Cache for 1 hour
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        response.body.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).send('Failed to load image');
    }
});

// List Assets
router.get('/', (req, res) => {
    try {
        const { type } = req.query;
        const assets = AssetService.listAssets(type as string);
        res.json({ success: true, data: assets });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
