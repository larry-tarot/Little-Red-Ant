/**
 * preload.ts
 * 在渲染进程(React)与主进程(Electron)之间架起一座安全桥梁
 *
 * 安全原则:
 *   - contextIsolation: true  (主世界与预加载世界隔离)
 *   - sandbox: true
 *   - nodeIntegration: false
 *   - 只通过 contextBridge.exposeInMainWorld 暴露最小 API 集
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// 工具:把 IpcRendererEvent 隐掉的 invoke 包装
function invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args);
}

function send(channel: string, ...args: any[]) {
  ipcRenderer.send(channel, ...args);
}

/** 订阅事件,返回取消订阅函数 */
function on<T = any>(channel: string, listener: (data: T) => void) {
  const handler = (_e: IpcRendererEvent, data: T) => listener(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  // ===== 应用基础 =====
  isElectron: true,
  appVersion: process.env.npm_package_version || '1.0.0',
  platform: process.platform as NodeJS.Platform,

  // ===== 窗口控制 =====
  window: {
    minimize: () => send('window:minimize'),
    maximize: () => send('window:maximize'),
    unmaximize: () => send('window:unmaximize'),
    close: () => send('window:close'),
    isMaximized: () => invoke<boolean>('window:isMaximized'),
  },

  // ===== 应用 =====
  app: {
    getBackendPort: () => invoke<number>('app:getBackendPort'),
    getBackendUrl: () => invoke<string>('app:getBackendUrl'),
    getUserDataPath: () => invoke<string>('app:getUserDataPath'),
    getVersion: () => invoke<string>('app:getVersion'),
    quit: () => send('app:quit'),
  },

  // ===== 文件系统(主进程代理,安全) =====
  fs: {
    openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
      invoke<{ path: string; content?: string } | null>('fs:openFile', options),
    saveFile: (defaultPath: string, content: string, filters?: { name: string; extensions: string[] }[]) =>
      invoke<{ path: string } | null>('fs:saveFile', { defaultPath, content, filters }),
    showItemInFolder: (path: string) => invoke<boolean>('fs:showItemInFolder', path),
  },

  // ===== 系统集成 =====
  shell: {
    openExternal: (url: string) => invoke<boolean>('shell:openExternal', url),
    showNotification: (title: string, body: string) =>
      send('notification:show', { title, body }),
  },

  // ===== 开机自启 =====
  autoLaunch: {
    get: () => invoke<boolean>('autoLaunch:get'),
    set: (enable: boolean) => invoke<boolean>('autoLaunch:set', enable),
  },

  // ===== 更新 =====
  update: {
    check: () => invoke<{ hasUpdate: boolean; version?: string }>('update:check'),
    install: () => invoke<boolean>('update:install'),
    onAvailable: (cb: (info: { version: string }) => void) => on('update:available', cb),
    onDownloaded: (cb: (info: { version: string }) => void) => on('update:downloaded', cb),
    onProgress: (cb: (info: { percent: number }) => void) => on('update:progress', cb),
  },

  // ===== 主题 =====
  theme: {
    get: () => invoke<'dark' | 'light' | 'system'>('theme:get'),
    set: (mode: 'dark' | 'light' | 'system') => invoke('theme:set', mode),
    onChange: (cb: (theme: 'dark' | 'light') => void) => on('theme:changed', cb),
  },

  // ===== 菜单事件(主进程发往渲染进程) =====
  menu: {
    onNewDraft: (cb: () => void) => on('menu:new-draft', cb),
    onFind: (cb: () => void) => on('menu:find', cb),
    onCommandPalette: (cb: () => void) => on('menu:command-palette', cb),
    onAbout: (cb: () => void) => on('menu:about', cb),
    onNavigate: (cb: (route: string) => void) => on('menu:navigate', cb),
  },

  // ===== 深链 =====
  deeplink: {
    onNavigate: (cb: (payload: { route: string; params: Record<string, string> }) => void) =>
      on('deeplink:navigate', cb),
  },

  // ===== 后端健康检查 =====
  backend: {
    health: () => invoke<{ status: string; uptime?: number }>('backend:health'),
  },

  // ===== playwright 浏览器 =====
  playwright: {
    onMissing: (cb: () => void) => on('playwright:missing', cb),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

// 暴露类型
export type ElectronAPI = typeof api;
