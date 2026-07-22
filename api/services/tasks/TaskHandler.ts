
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
     * @param onProgress 可选进度回调。Handler 应在关键阶段调用一次或多次,
     *                   例如 10% 启动 / 50% 中段 / 90% 终态前。Handler 不应
     *                   自己写 DB 或 emit 事件 —— 仅通过回调传出,由 Worker 统一处理。
     */
    handle(
        task: any,
        onProgress?: (event: TaskProgressEvent) => void
    ): Promise<any>;
}
