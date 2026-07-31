
/**
 * 功能描述：管理运行中任务的取消信号
 *
 * 设计思路：
 * - Worker 启动任务时注册 AbortController
 * - cancelTask 调用 abort() 发送取消信号
 * - Handler 可在长耗时操作中检查 signal.aborted，优雅退出
 */
class TaskController {
    private controllers = new Map<string, AbortController>();

    /**
     * 功能描述：为指定任务创建并注册 AbortController
     *
     * 参数说明：
     * - taskId: [string] 任务 ID
     *
     * 返回说明：
     * - AbortSignal 取消信号
     */
    create(taskId: string): AbortSignal {
        const existing = this.controllers.get(taskId);
        if (existing) {
            if (!existing.signal.aborted) return existing.signal;
            this.controllers.delete(taskId);
        }

        const controller = new AbortController();
        this.controllers.set(taskId, controller);
        return controller.signal;
    }

    /**
     * 功能描述：取消指定任务
     *
     * 参数说明：
     * - taskId: [string] 任务 ID
     *
     * 返回说明：
     * - boolean 是否成功发送取消信号
     */
    abort(taskId: string): boolean {
        const controller = this.controllers.get(taskId);
        if (!controller || controller.signal.aborted) return false;
        controller.abort();
        return true;
    }

    /**
     * 功能描述：任务结束后清理控制器
     */
    remove(taskId: string): void {
        this.controllers.delete(taskId);
    }

    /**
     * 功能描述：获取指定任务的取消信号
     */
    getSignal(taskId: string): AbortSignal | undefined {
        return this.controllers.get(taskId)?.signal;
    }
}

export const taskController = new TaskController();
