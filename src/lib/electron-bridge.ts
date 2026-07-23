/**
 * Electron Bridge 适配层
 * 在浏览器/web 环境下,所有方法都是 no-op 或返回默认值
 * 在 Electron 环境下,代理到 window.electronAPI
 */

const noop = () => undefined;
const noopUnsub = () => () => undefined;
const noopAsync = async () => null;

/** Web 环境的 stub,所有方法都安全 no-op */
const webStub: any = {
  isElectron: false,
  appVersion: '0.0.0',
  platform: 'web',
  window: {
    minimize: noop,
    maximize: noop,
    unmaximize: noop,
    close: noop,
    isMaximized: async () => false,
  },
  app: {
    getBackendPort: async () => 3001,
    getBackendUrl: async () => '',
    getUserDataPath: async () => '',
    getVersion: async () => '0.0.0',
    quit: noop,
  },
  fs: {
    openFile: noopAsync,
    saveFile: noopAsync,
    showItemInFolder: async () => false,
  },
  shell: {
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
    showNotification: noop,
  },
  autoLaunch: { get: async () => false, set: async () => false },
  update: {
    check: async () => ({ hasUpdate: false }),
    install: async () => false,
    onAvailable: noopUnsub,
    onDownloaded: noopUnsub,
    onProgress: noopUnsub,
  },
  theme: {
    get: async () => 'system',
    set: async () => 'system',
    onChange: noopUnsub,
  },
  menu: {
    onNewDraft: noopUnsub,
    onFind: noopUnsub,
    onCommandPalette: noopUnsub,
    onAbout: noopUnsub,
    onNavigate: noopUnsub,
  },
  deeplink: { onNavigate: noopUnsub },
  backend: { health: async () => ({ status: 'unknown' }) },
};

export const electron: any =
  typeof window !== 'undefined' && (window as any).electronAPI
    ? (window as any).electronAPI
    : webStub;

export const isElectron: boolean = Boolean(electron?.isElectron);
