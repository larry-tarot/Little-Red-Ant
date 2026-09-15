
import db from '../../../db.js';
import { openPublishPageWithContent } from '../../rpa/publish.js';
import { VideoProjectService } from '../../video/VideoProjectService.js';
import { TaskHandler, TaskProgressEvent } from '../TaskHandler.js';

import { ComplianceService } from '../../core/ComplianceService.js';
import { Logger } from '../../LoggerService.js';

export class PublishHandler implements TaskHandler {
    async handle(task: any, onProgress?: (e: TaskProgressEvent) => void, signal?: AbortSignal): Promise<any> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }
        // payload: { title, content, tags, imageData, autoPublish, accountId }
        const publishPayload = task.payload;
        const report = (progress: number, stage: string) =>
            onProgress?.({ taskId: task.id, progress, stage });

        // 0. Explicit human confirmation is a hard write boundary.
        // Queueing or generating a draft must never itself authorize account writes.
        if (publishPayload.confirmedByUser !== true) {
            throw new Error('Explicit user confirmation is required before publishing.');
        }

        // 1. Compliance Check (The Gatekeeper)
        // Ensure content is safe before proceeding
        const fullText = `${publishPayload.title}\n${publishPayload.content}`;
        const complianceResult = ComplianceService.check(fullText);

        if (!complianceResult.isCompliant) {
            const errorMsg = `Content blocked by Compliance Service. Blocked words: ${complianceResult.blockedWords.join(', ')}`;
            Logger.warn('PublishHandler', errorMsg);
            throw new Error(errorMsg); // Hard Block
        }

        if (complianceResult.score < 60) {
            if (complianceResult.score < 30) {
                const errorMsg = `Content risk score too low (${complianceResult.score}). Blocked by Compliance Service.`;
                Logger.warn('PublishHandler', errorMsg);
                throw new Error(errorMsg); // Hard Block — too risky
            }
            // Score 30-59: Soft warning — allow with a flag so the frontend can
            // show a confirmation dialog. The publish still proceeds.
            const warningMsg = `Content risk score is low (${complianceResult.score}). Please review before publishing.`;
            Logger.warn('PublishHandler', warningMsg);
            publishPayload.complianceWarning = warningMsg;
            publishPayload.complianceScore = complianceResult.score;
        }

        // 1. Resolve Account ID
        if (!publishPayload.accountId) {
            const active = db.prepare('SELECT id FROM accounts WHERE is_active = 1').get() as { id: number };
            if (active) publishPayload.accountId = active.id;
        }

        // 2. Check Daily Limit (Safety)
        if (publishPayload.accountId) {
            const todayStart = new Date();
            todayStart.setHours(0,0,0,0);
            const todayStr = todayStart.toISOString();

            const dailyCount = db.prepare(`
                SELECT COUNT(*) as count FROM tasks
                WHERE type = 'PUBLISH'
                AND status = 'COMPLETED'
                AND updated_at >= ?
                AND json_extract(payload, '$.accountId') = ?
            `).get(todayStr, publishPayload.accountId) as { count: number };

            const DAILY_LIMIT = 5;

            if (dailyCount.count >= DAILY_LIMIT) {
                throw new Error(`Daily publish limit (${DAILY_LIMIT}) reached for account ${publishPayload.accountId}. Safety protection triggered.`);
            }
        }

        // 3. Execute RPA — the heavy lift; the RPA layer itself logs screenshots but doesn't
        //    expose fine-grained progress, so we bracket it with coarse milestones.
        report(10, '合规检查通过 · 准备发布');
        const result = await openPublishPageWithContent(publishPayload, task.id, (stage) => {
            // Map RPA sub-stages to roughly 10–90% so the UI bar moves smoothly.
            const stageMap: Record<string, number> = {
                '打开创作中心': 20,
                '上传图片': 40,
                '填写标题': 55,
                '填写正文': 65,
                '提交发布': 80,
                '等待发布回执': 90,
            };
            const pct = stageMap[stage] ?? 60;
            report(pct, stage);
        });
        report(95, '回写发布结果');

        // 4. Post-Publish Updates (P0 Closed-Loop Writeback)
        // Defensive: rpa/publish can return undefined when the browser closed early
        // (a known case documented in publish.ts:467-468). Treat that as a soft-fail
        // — we threw the original error upstream, but if we somehow got past that,
        // do not crash here trying to read result.success.
        if (!result) {
            Logger.warn('PublishHandler', 'RPA returned no result; skipping writeback');
            return { success: false, warning: 'RPA returned no result' };
        }
        if (result.success && result.noteId) {
            // 4a. Update Draft with published note_id / url
            if (publishPayload.draftId) {
                try {
                    db.prepare('UPDATE drafts SET published_note_id = ?, published_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                      .run(result.noteId, result.noteUrl || '', publishPayload.draftId);
                } catch (e) {
                    console.error('Failed to update draft with published info', e);
                }

                // 4b. Closed-loop: bind draft_id on note_stats so analytics can do exact JOIN
                //      instead of fuzzy title matching. Idempotent — safe to re-run on retries.
                try {
                    const existing = db.prepare('SELECT id FROM note_stats WHERE note_id = ?').get(result.noteId) as { id: number } | undefined;
                    if (existing) {
                        db.prepare('UPDATE note_stats SET draft_id = ?, account_id = COALESCE(account_id, ?) WHERE id = ?')
                          .run(publishPayload.draftId, publishPayload.accountId ?? null, existing.id);
                    } else {
                        db.prepare(`
                            INSERT INTO note_stats (note_id, draft_id, account_id, record_date)
                            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        `).run(result.noteId, publishPayload.draftId, publishPayload.accountId ?? null);
                    }

                    // 4c. Seed history row so getHistory() trend chart has a data point on day 0
                    db.prepare(`
                        INSERT INTO note_stats_history (note_id, account_id, record_time)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `).run(result.noteId, publishPayload.accountId ?? null);
                } catch (e) {
                    console.error('Failed to bind draft_id on note_stats', e);
                }
            }

            // 4d. Update Video Project Status (if applicable)
            if (publishPayload.projectId) {
                // Also update note_id in video_projects if column exists (it should now)
                try {
                    db.prepare('UPDATE video_projects SET note_id = ? WHERE id = ?').run(result.noteId, publishPayload.projectId);
                } catch (_e) { /* ignore */ }
            }
        }

        // 5. Update Video Project Status (General)
        if (publishPayload.projectId) {
            VideoProjectService.updateProjectStatus(publishPayload.projectId, 'COMPLETED', undefined, 'PUBLISHED');
        }

        return result;
    }
}
