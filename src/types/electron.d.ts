/**
 * Electron API 类型声明
 * 暴露给渲染进程的安全 API
 */
interface ElectronAPI {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    getBackendPort: () => Promise<number>;
    showNotification: (title: string, body: string) => void;
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => void;
}

interface Window {
    electronAPI?: ElectronAPI;
}