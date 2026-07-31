
import { TaskHandler, TaskProgressEvent } from '../TaskHandler.js';
import { VideoStitcher } from '../../video/VideoStitcher.js';
import { VideoProjectService } from '../../video/VideoProjectService.js';

export class VideoStitchHandler implements TaskHandler {
    private stitcher: VideoStitcher;

    constructor() {
        this.stitcher = new VideoStitcher();
    }

    async handle(task: any, onProgress?: (e: TaskProgressEvent) => void, signal?: AbortSignal): Promise<any> {
        if (signal?.aborted) {
            throw new Error('TASK_CANCELLED');
        }
        const { projectId, scenes, bgmUrl } = task.payload;
        const report = (progress: number, stage: string) =>
            onProgress?.({ taskId: task.id, progress, stage });

        console.log(`[VideoStitchHandler] Starting stitch for project ${projectId}`);
        report(10, '准备合成');

        // Update project status to GENERATING
        VideoProjectService.updateProjectStatus(projectId, 'GENERATING');

        try {
            report(50, '下载分镜视频');
            const finalUrl = await this.stitcher.stitch(scenes, bgmUrl);
            report(85, '混流 + BGM');

            // Update project status to COMPLETED
            VideoProjectService.updateProjectStatus(projectId, 'COMPLETED', finalUrl);
            report(100, '完成');

            return { url: finalUrl };
        } catch (error: any) {
            console.error(`[VideoStitchHandler] Failed: ${error.message}`);
            // Revert status or set to FAILED (if supported, otherwise DRAFT)
            // Ideally we should have a FAILED status, but for now DRAFT is safer so user can retry
            VideoProjectService.updateProjectStatus(projectId, 'DRAFT');
            throw error;
        }
    }
}
