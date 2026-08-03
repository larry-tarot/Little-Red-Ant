
import db from '../../../db.js';
import { ContentService } from '../../ai/ContentService.js';
import { scrapeNoteDetail } from '../../rpa/xiaohongshu.js';
import { TaskHandler, TaskProgressEvent } from '../TaskHandler.js';
import { TrendService } from '../../core/TrendService.js';
import { Logger } from '../../LoggerService.js';

export class AnalyzeNoteHandler implements TaskHandler {
    async handle(task: any, onProgress?: (e: TaskProgressEvent) => void, signal?: AbortSignal): Promise<any> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }
        const noteId = task.payload.noteId;
        const report = (p: number, s: string) => onProgress?.({ taskId: task.id, progress: p, stage: s });
        Logger.info('Worker', `Analyzing note ${noteId}...`);
        report(5, '获取笔记数据');

        // 1. Get current note data via Service
        let note = TrendService.getNoteById(noteId);

        // 2. If content missing, deep scrape
        if (!note || !note.content) {
            report(20, '深入抓取笔记详情');
            note = await this.deepScrape(noteId, note);
        }

        // 3. AI Analysis
        if (!note.content && !note.title) {
            throw new Error('无法获取笔记内容进行分析');
        }
        
        if (note.type === 'video' && !note.transcript) {
             if ((note.content || '').length < 50) {
                 throw new Error('视频笔记提取失败：无法获取视频字幕，且正文内容过短，无法进行深度分析。');
             }
        }

        let contentToAnalyze = note.content || note.title || '';
        if (note.transcript) {
            contentToAnalyze += `\n\n【视频口播文案 (Transcript)】\n${note.transcript}`;
        }

        report(40, 'AI 分析笔记结构');
        const analysis = await ContentService.analyzeNoteStructure(
            contentToAnalyze,
            note.title || '',
            note.type || 'image',
            (note as any).videoFrames || [],
            undefined, // audioPath
            note.images ? (typeof note.images === 'string' ? JSON.parse(note.images) : note.images) : []
        );

        // 4. Save Analysis via Service
        report(80, '保存分析结果');
        TrendService.saveAnalysisResult(noteId, analysis);

        report(100, '完成');
        return { noteId, analysis };
    }

    private async deepScrape(noteId: string, currentNote: any) {
        Logger.info('Worker', `Content missing for ${noteId}, starting deep scrape...`);
        try {
            const noteInfo = TrendService.getNoteById(noteId);
            const hasTokenUrl = !!(noteInfo && noteInfo.note_url && noteInfo.note_url.includes('xsec_token'));
            const targetIdOrUrl = hasTokenUrl ? noteInfo.note_url : noteId;
            if (!hasTokenUrl) {
                // 无 xsec_token 裸连必被 300031 安全重定向（见 crawl/test_results.md 实战测试）
                Logger.warn('Worker', `Note ${noteId} has no xsec_token in DB, bare-id access may hit SEC_REDIRECT (300031)`);
            }
            
            const activeAccount = db.prepare('SELECT id FROM accounts WHERE is_active = 1').get() as { id: number };
            const accountId = activeAccount ? activeAccount.id : undefined;

            const details = await scrapeNoteDetail(targetIdOrUrl, accountId);
            
            let videoFrames: string[] = [];
            
            if (details.is_video && details.likes_count > 100) {
                videoFrames = await this.processVideo(details);
            }

            // Update DB via Service
            const updatedNote = TrendService.updateNoteDetails(noteId, details, videoFrames);
            
            // Merge with currentNote to preserve other fields if needed, but Service returns fresh details
            return { ...currentNote, ...updatedNote };

        } catch (scrapeError: any) {
            Logger.error('Worker', `Failed to scrape note ${noteId}:`, scrapeError);
            if (scrapeError.message && (scrapeError.message.includes('ACCOUNT_BLOCKED') || scrapeError.message.includes('IP_BLOCKED') || scrapeError.message.includes('NOTE_UNAVAILABLE') || scrapeError.message.includes('SEC_REDIRECT'))) {
                throw scrapeError;
            }
            throw new Error(`无法获取笔记详情: ${scrapeError.message}`);
        }
    }

    private async processVideo(details: any) {
        Logger.info('Worker', `Video note detected (${details.likes_count} likes), starting deep video processing...`);
        try {
            if (details.video_url) {
                const { VideoProcessor } = await import('../../video/VideoProcessor.js');
                const processor = new VideoProcessor();
                const videoResult = await processor.processVideo(details.video_url);
                
                if (videoResult.transcript) {
                    details.transcript = videoResult.transcript;
                }
                
                if (videoResult.frames) {
                    return videoResult.frames;
                }
            }
        } catch (vpError) {
            Logger.error('Worker', 'Video processing failed:', vpError);
        }
        return [];
    }
}
