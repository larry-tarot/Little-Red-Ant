
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * Check if a URL points to an internal/private network address.
 * Used to prevent SSRF attacks via the video downloader.
 * Duplicated from api/routes/assets.ts since it's a critical security function
 * and should live close to the code that uses it.
 */
function isInternalUrl(urlStr: string): boolean {
    try {
        const url = new URL(urlStr);
        const hostname = url.hostname.toLowerCase();

        if (hostname === 'localhost' || hostname === '[::1]' || hostname === '0.0.0.0') return true;

        const parts = hostname.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => !isNaN(p))) {
            if (parts[0] === 10) return true;
            if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
            if (parts[0] === 192 && parts[1] === 168) return true;
            if (parts[0] === 127) return true;
            if (parts[0] === 169 && parts[1] === 254) return true;
            if (parts[0] === 0) return true;
        }
        return false;
    } catch {
        return true; // If URL parsing fails, treat as unsafe
    }
}

export class VideoDownloader {
    private tempDir: string;

    constructor() {
        this.tempDir = path.resolve(process.cwd(), 'temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Download video/audio from URL to temporary file
     * Handles both remote URLs (http) and local static paths (starting with /)
     * @param url Video/Audio URL
     * @returns Path to downloaded/copied temp file
     */
    async download(url: string): Promise<string> {
        // 1. Handle Local Static Files
        if (url && url.startsWith('/')) {
            // Assume relative to public dir
            const publicDir = path.resolve(process.cwd(), 'public');
            const sourcePath = path.join(publicDir, url.replace(/^\//, '')); // Remove leading slash
            
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Local file not found: ${sourcePath}`);
            }

            const ext = path.extname(sourcePath) || '.mp4';
            const filename = `${randomUUID()}${ext}`;
            const destPath = path.join(this.tempDir, filename);

            console.log(`[VideoDownloader] Copying local file ${sourcePath} to ${destPath}...`);
            fs.copyFileSync(sourcePath, destPath);
            return destPath;
        }

        // 2. Handle Remote URLs — with SSRF protection
        if (!url || !url.startsWith('http')) {
            throw new Error(`Invalid video URL: ${url}`);
        }

        // Sprint 8: SSRF protection — block internal network requests
        if (isInternalUrl(url)) {
            throw new Error(`Blocked internal URL: ${url}. This prevents SSRF attacks.`);
        }

        const ext = '.mp4'; // Assume mp4 for now, or detect from content-type
        const filename = `${randomUUID()}${ext}`;
        const filePath = path.join(this.tempDir, filename);

        console.log(`[VideoDownloader] Downloading ${url} to ${filePath}...`);

        const writer = fs.createWriteStream(filePath);

        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: 60000, // 60s timeout
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.xiaohongshu.com/'
                }
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', (err) => {
                    this.cleanup(filePath);
                    reject(err);
                });
            });
        } catch (error: any) {
            this.cleanup(filePath);
            throw new Error(`Download failed: ${error.message}`);
        }
    }

    /**
     * Delete file if exists
     */
    cleanup(filePath: string) {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`[VideoDownloader] Cleaned up ${filePath}`);
            } catch (e) {
                console.error(`[VideoDownloader] Failed to cleanup ${filePath}`, e);
            }
        }
    }
}
