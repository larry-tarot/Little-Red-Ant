import crypto from 'crypto';
import config from '../../config.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

export class EncryptionService {
    private static getKey(): Buffer {
        // Sprint 8: Use a dedicated COOKIE_ENCRYPTION_KEY instead of reusing the JWT secret.
        // JWT secret and encryption key should be independent — if one is compromised,
        // the other must remain safe. In production, set COOKIE_ENCRYPTION_KEY in .env.
        // Fallback to JWT_SECRET for legacy deployments, but always warn.
        const secret = process.env.COOKIE_ENCRYPTION_KEY || config.security.jwtSecret;
        if (!process.env.COOKIE_ENCRYPTION_KEY) {
            console.warn('[Encryption] Using JWT_SECRET as encryption key. Set COOKIE_ENCRYPTION_KEY for better security isolation.');
        }
        return crypto.createHash('sha256').update(secret).digest();
    }

    static encrypt(text: string): string {
        if (!text) return text;
        
        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);
            let encrypted = cipher.update(text);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            // Format: iv:encryptedData
            return iv.toString('hex') + ':' + encrypted.toString('hex');
        } catch (error) {
            console.error('[Encryption] Encrypt failed:', error);
            throw new Error('Encryption failed');
        }
    }

    static decrypt(text: string): string {
        if (!text) return text;

        // Lazy Migration: If it doesn't look like encrypted (no colon), return original.
        // This supports legacy plain-text cookies until they are re-saved.
        if (!text.includes(':')) {
            return text;
        }

        const textParts = text.split(':');
        const ivHex = textParts.shift();
        if (!ivHex || ivHex.length !== IV_LENGTH * 2) {
            // 包含冒号但长度不对，说明不是合法密文，直接报错而非静默返回原始值，
            // 避免把错误密文当成有效数据继续传播。
            throw new Error('Decryption failed: invalid ciphertext format');
        }

        try {
            const iv = Buffer.from(ivHex, 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv(ALGORITHM, this.getKey(), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            return decrypted.toString();
        } catch (error) {
            // 解密失败说明数据已损坏或密钥错误，不能再静默返回原始密文，
            // 否则上层会误以为解密成功并继续使用敏感数据。
            console.error('[Encryption] Decrypt failed:', error);
            throw new Error('Decryption failed');
        }
    }
}
