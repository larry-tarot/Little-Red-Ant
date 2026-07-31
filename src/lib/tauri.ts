/**
 * 统一的 Tauri 桌面版运行环境检测。
 *
 * 使用场景：
 * - axios baseURL 在桌面版需要指向本地后端 sidecar
 * - Layout/TitleBar 只在桌面版渲染自定义标题栏
 * - Settings 只在桌面版显示"桌面设置"标签
 * - BackendBootGate 只在桌面版等待后端启动
 */
interface TauriWindow extends Window {
    __TAURI_INTERNALS__?: unknown;
}

export const isTauri =
    typeof window !== 'undefined' && !!(window as TauriWindow).__TAURI_INTERNALS__;
