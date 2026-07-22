import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import db from '../../db.js';

export interface Asset {
    id: string;
    type: 'audio' | 'image' | 'video';
    filename: string;
    url: string;
    size: number;
    created_at: string;
}

// Ensure upload directory exists
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'assets');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = randomUUID();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    }
});

export const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const type = (req as any).params?.type;
        const allowedMimeTypes: Record<string, string[]> = {
            image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
            audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/aac'],
            video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo']
        };
        
        if (!type || !allowedMimeTypes[type]) {
            return cb(null, false);
        }
        
        if (allowedMimeTypes[type].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
});

export class AssetService {
    
    static saveAssetRecord(file: Express.Multer.File, type: 'audio' | 'image' | 'video'): Asset {
        const id = randomUUID();
        const url = `/uploads/assets/${file.filename}`;
        
        db.prepare(`
            INSERT INTO assets (id, type, filename, url, size, mime_type)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, type, file.originalname, url, file.size, file.mimetype);

        return this.getAsset(id)!;
    }

    static getAsset(id: string): Asset | undefined {
        return db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Asset;
    }

    static listAssets(type?: string): Asset[] {
        if (type) {
            return db.prepare('SELECT * FROM assets WHERE type = ? ORDER BY created_at DESC').all(type) as Asset[];
        }
        return db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all() as Asset[];
    }

    /**
     * Download an external image URL to local storage and return the local URL
     */
    static async downloadAndLocalize(externalUrl: string, type: 'image' | 'video' = 'image'): Promise<string> {
        // 1. Check if already local
        if (externalUrl.startsWith('/uploads/') || externalUrl.startsWith('http://localhost')) {
            return externalUrl;
        }

        try {
            const fetch = (await import('node-fetch')).default;
            const res = await fetch(externalUrl);
            if (!res.ok) throw new Error(`Failed to fetch ${externalUrl}: ${res.statusText}`);

            let buffer = await res.buffer();
            const id = randomUUID();

            // 2. Image compression: convert to WebP for smaller file size
            // This reduces image size by 60-80% with negligible quality loss.
            // Videos are stored as-is (no compression).
            let ext = type === 'image' ? '.png' : '.mp4';
            let mimeType = type === 'image' ? 'image/png' : 'video/mp4';

            if (type === 'image') {
                try {
                    const sharp = (await import('sharp')).default;
                    const compressed = await sharp(buffer)
                        .webp({ quality: 80, effort: 4 }) // quality 80, encoding effort 4/6
                        .toBuffer();
                    // Only use WebP if it's actually smaller (sharp can sometimes increase size for small images)
                    if (compressed.length < buffer.length) {
                        buffer = compressed;
                        ext = '.webp';
                        mimeType = 'image/webp';
                    }
                } catch (e) {
                    // Sharp not available or compression failed — use original
                    console.warn('[AssetService] Image compression skipped:', (e as Error).message);
                }
            }

            const filename = `${id}${ext}`;
            const filepath = path.join(UPLOAD_DIR, filename);

            fs.writeFileSync(filepath, buffer);

            const localUrl = `/uploads/assets/${filename}`;

            // Save to DB
            db.prepare(`
                INSERT INTO assets (id, type, filename, url, size, mime_type)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(id, type, filename, localUrl, buffer.length, mimeType);

            console.log(`[AssetService] Localized ${type}: ${externalUrl} -> ${localUrl}`);
            return localUrl;

        } catch (error) {
            console.error(`[AssetService] Localization failed for ${externalUrl}:`, error);
            // Return original URL as fallback if download fails, to not break the UI
            return externalUrl;
        }
    }
}
