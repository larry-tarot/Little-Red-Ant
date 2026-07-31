
import db from '../../../db.js';
import { ContentService } from '../../ai/ContentService.js';
import { TaskHandler, TaskProgressEvent } from '../TaskHandler.js';

export class GenerateContentHandler implements TaskHandler {
    async handle(task: any, onProgress?: (e: TaskProgressEvent) => void, signal?: AbortSignal): Promise<any> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }
        const report = (progress: number, stage: string) =>
            onProgress?.({ taskId: task.id, progress, stage });

        // 1. Try to find Account (New Persona System)
        let account;
        if (task.payload.accountId) {
            account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(task.payload.accountId);
        } else {
            account = db.prepare('SELECT * FROM accounts WHERE is_active = 1').get();
        }

        if (account) {
            console.log(`[Worker] Generating content using Account Persona: ${account.nickname}`);
            report(20, '加载人设');
            const result = await ContentService.generateNote({
                niche: account.niche || '通用',
                identity_tags: [],
                style: task.payload.style || account.tone || '亲切自然',
                _topic: task.payload.topic,
                _keywords: task.payload.keywords,
                remix_structure: task.payload.remix_structure,
                contentType: task.payload.contentType,
                persona_desc: account.persona_desc,
                writing_samples: account.writing_sample ? [account.writing_sample] : []
            });
            report(90, '解析生成结果');
            return result;
        } else {
            // 2. Fallback to Legacy User Profile
            console.log('[Worker] No active account found, falling back to legacy User Profile...');
            let user = db.prepare('SELECT * FROM users WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
            if (!user) {
                user = db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 1').get();
            }

            if (!user) throw new Error('No account or user profile found. Please configure a persona in Account Management.');

            report(20, '加载用户画像');
            const userProfile = {
                niche: (user as any).niche,
                identity_tags: JSON.parse((user as any).identity_tags as string || '[]'),
                style: task.payload.style || (user as any).style,
                writing_samples: JSON.parse((user as any).writing_samples as string || '[]'),
            };

            const result = await ContentService.generateNote({
                ...userProfile,
                _topic: task.payload.topic,
                _keywords: task.payload.keywords,
                remix_structure: task.payload.remix_structure,
                contentType: task.payload.contentType,
                _custom_instructions: task.payload.custom_instructions
            });
            report(90, '解析生成结果');
            return result;
        }
    }
}
