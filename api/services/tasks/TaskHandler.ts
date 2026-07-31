
/**
 * 任务进度事件:Handler 通过 onProgress 回调报告当前阶段。
 * Worker 负责持久化到 tasks.progress 并转发给 SSE 订阅者。
 */
export interface TaskProgressEvent {
    taskId: string;
    progress: number; // 0-100
    stage?: string;   // 可读阶段名,如 '生成文案' / '上传图片' / '点击发布'
    message?: string; // 可选详细信息
}

export interface TaskHandler {
    /**
     * 执行任务。
     *
     * 参数说明：
     * - task: [any] 任务对象，包含 id/type/payload 等
     * - onProgress: [(event: TaskProgressEvent) => void] 可选进度回调
     * - signal: [AbortSignal] 取消信号，Handler 应在长耗时操作中检查 signal.aborted
     *
     * 返回说明：
     * - Promise<any> 任务执行结果
     */
    handle(
        task: any,
        onProgress?: (event: TaskProgressEvent) => void,
        signal?: AbortSignal
    ): Promise<any>;
}
