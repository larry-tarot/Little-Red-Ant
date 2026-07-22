import db from '../db.js';
import { EncryptionService } from './core/EncryptionService.js';

/**
 * Sprint 8: Sensitive keys (API keys, secrets) are encrypted at rest using
 * EncryptionService. The heuristic: any key ending with _api_key, _secret, or _key
 * is treated as sensitive. When writing, we encrypt before storing; when reading,
 * we decrypt on the fly. This ensures that even if the database file is leaked,
 * API keys remain protected.
 */
function isSensitiveKey(key: string): boolean {
    return key.endsWith('_api_key') || key.endsWith('_secret') || key.endsWith('_key');
}

export class SettingsService {
    private static cache: Record<string, string> | null = null;

    private static ensureCache() {
        if (this.cache === null) {
            const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string, value: string }[];
            this.cache = {};
            rows.forEach(row => {
                // Decrypt sensitive values on load into cache
                this.cache![row.key] = isSensitiveKey(row.key)
                    ? EncryptionService.decrypt(row.value)
                    : row.value;
            });
        }
    }

    static async get(key: string): Promise<string | null> {
        this.ensureCache();
        return this.cache![key] ?? null;
    }

    static async set(key: string, value: string, description?: string): Promise<void> {
        // Encrypt sensitive values before storing to DB
        const storedValue = isSensitiveKey(key) ? EncryptionService.encrypt(value) : value;

        const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
        if (exists) {
            db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(storedValue, key);
        } else {
            db.prepare('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)').run(key, storedValue, description || '');
        }

        // Update Cache (plaintext)
        if (this.cache) {
            this.cache[key] = value;
        }
    }

    static async getAll(): Promise<Record<string, string>> {
        this.ensureCache();
        return { ...this.cache! };
    }
}
