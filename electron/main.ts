/**
 * 主进程入口
 *
 * 关键决策:
 *   1. 后端用 ELECTRON_RUN_AS_NODE 复用 Electron 自带的 V8,避免装 Node
 *   2. 后端日志转发到 electron-log
 *   3. 单实例 + 托盘 + 自定义协议 + 窗口状态
 *   4. 生产模式 devTools 关闭
 *   5. 进程崩溃隔离: 后端死了弹窗,主窗口依然能展示错误页
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, globalShortcut, shell, dialog, nativeTheme, session } from 'electron';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import log from 'electron-log';

import { setupSingleInstance } from './single-instance.js';
import { autoLaunch } from './auto-launch.js';
import { registerProtocol } from './protocol.js';
import { WindowStateKeeper } from './window-state.js';
import { buildAppMenu } from './menu.js';
import { registerShortcuts, unregisterAllShortcuts } from './shortcuts.js';
import { settings } from './settings-store.js';
import { checkForUpdates } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;

// ============================================================
// 日志
// ============================================================
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'info';
log.info('🚀 小红蚁启动中...');
log.info(`version=${app.getVersion()}, platform=${process.platform}, arch=${process.arch}`);
// userData 路径在 app ready 之后才稳,延后到 whenReady 内打印

// ============================================================
// 进程间全局
// ============================================================
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendProcess: ChildProcess | null = null;
let backendReady = false;
let backendCrashed = false;
let isQuitting = false;
const windowState = new WindowStateKeeper();

// 扩展 Electron App 类型,添加 isQuitting 标记
type AppWithQuitting = typeof app & { isQuitting?: boolean };
const isAppQuitting = () => !!(app as AppWithQuitting).isQuitting;
const setAppQuitting = (v: boolean) => { (app as AppWithQuitting).isQuitting = v; };
(app as AppWithQuitting).isQuitting = false;

// ============================================================
// 单实例
// ============================================================
if (!setupSingleInstance()) {
  log.info('[SingleInstance] 已有实例运行,退出');
  app.quit();
  process.exit(0);
}

// ============================================================
// 深链协议
// ============================================================
registerProtocol();

// ============================================================
// 后端启动
// ============================================================
async function startBackend(): Promise<void> {
  // 确保 userData/.env 存在(.env.example 复制过去)
  const userData = app.getPath('userData');
  const userEnv = path.join(userData, '.env');
  if (!existsSync(userEnv)) {
    try {
      const examplePath = isDev
        ? path.resolve(__dirname, '..', '.env.example')
        : path.join(__dirname, '..', '.env.example');
      if (existsSync(examplePath)) {
        copyFileSync(examplePath, userEnv);
        log.info('[Setup] 已初始化 ' + userEnv);
        generateJwtSecretIfDefault(userEnv);
      } else {
        log.warn('[Setup] 找不到 .env.example: ' + examplePath);
      }
    } catch (e) {
      log.warn('[Setup] 复制 .env.example 失败:', e);
    }
  } else {
    generateJwtSecretIfDefault(userEnv);
  }

  if (isDev) {
    // 开发:spawn 子进程,用 tsx 加载器
    return new Promise((resolve) => {
      const nodePath = process.execPath;
      const tsxLoader = path.resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
      const backendEntry = path.resolve(__dirname, '..', 'api', 'server.ts');
      const args = [
        '--import', 'tsx/esm',
        backendEntry,
        '--no-deprecation',
      ];
      const cwd = path.resolve(__dirname, '..');

      log.info('[Backend] 启动: ' + nodePath + ' ' + args.join(' ') + ' (cwd=' + cwd + ')');

      const env = {
        ...process.env,
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'development',
        XIAOHONGYI_USER_DATA: app.getPath('userData'),
        ELECTRON_RUN_AS_NODE: '1',
      };

      backendProcess = spawn(nodePath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        cwd,
      });

      backendProcess.stdout?.on('data', (data: Buffer) => {
        const s = data.toString();
        log.info('[Backend] ' + s.trim());
        if (!backendReady && (s.includes('Server ready') || s.includes('listening'))) {
          backendReady = true;
          resolve();
        }
      });

      backendProcess.stderr?.on('data', (data: Buffer) => {
        const s = data.toString();
        if (s.includes('DeprecationWarning')) {
          log.debug('[Backend] ' + s.trim());
        } else {
          log.warn('[Backend] ' + s.trim());
        }
        if (!backendReady && (s.includes('Server ready') || s.includes('listening'))) {
          backendReady = true;
          resolve();
        }
      });

      backendProcess.on('exit', (code, signal) => {
        const msg = '后端进程退出 code=' + code + ' signal=' + signal;
        log.error('[Backend] ' + msg);
        backendProcess = null;
        backendReady = false;
        if (!isQuitting) {
          backendCrashed = true;
          if (mainWindow) {
            dialog.showErrorBox('后端服务异常', msg + '\n请重启应用或联系开发者。');
            app.quit();
          }
        }
      });

      backendProcess.on('error', (err) => {
        log.error('[Backend] spawn error:', err);
      });

      setTimeout(() => {
        if (!backendReady) {
          log.warn('[Backend] 启动超时(15s),继续加载窗口');
          resolve();
        }
      }, 15000);
    });
  }

  // 生产:直接在主进程中 import 后端代码(主进程有 asar 集成)
  log.info('[Backend] 在主进程中加载后端...');
  try {
    const backendEntry = path.join(process.resourcesPath, 'api-dist', 'server.mjs');
    process.env.PORT = String(BACKEND_PORT);
    process.env.NODE_ENV = 'production';
    process.env.XIAOHONGYI_USER_DATA = app.getPath('userData');

    await import(backendEntry);
    backendReady = true;
    backendProcess = null;
    log.info('[Backend] 后端就绪');
  } catch (e) {
    const msg = '后端加载失败: ' + (e instanceof Error ? e.message : String(e));
    log.error('[Backend] ' + msg);
    backendCrashed = true;
    if (mainWindow) {
      dialog.showErrorBox('后端服务异常', msg + '\n请重启应用或联系开发者。');
      app.quit();
    }
  }
}
// ============================================================
// 窗口
// ============================================================
async function createWindow() {
  const isHidden = process.argv.includes('--hidden');
  windowState.init(); // 必须在 new BrowserWindow 之前 init(screen 校验)

  mainWindow = new BrowserWindow({
    ...windowState.getOptions(),
    minWidth: 1024,
    minHeight: 640,
    show: !isHidden,
    frame: false, // 自定义标题栏
    backgroundColor: '#0F172A',
    title: '小红蚁',
    // Windows 优先 .ico(多尺寸),macOS/Linux 用 .png
    icon: process.platform === 'win32'
      ? path.join(__dirname, '..', 'resources', 'icon.ico')
      : path.join(__dirname, '..', 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev,
    },
  });

  windowState.manage(mainWindow);

  if (isDev) {
    // dev 模式:Vite 5173 + 后端 3001
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // 生产模式:后端 Express 同时托管 dist/ 前端
    await mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
  }

  // 外部链接走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${BACKEND_PORT}`) && !url.startsWith('http://localhost:5173')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('close', (e) => {
    // 桌面版默认关闭即退出(用户从托盘菜单可显式退出)
    if (!isAppQuitting()) {
      e.preventDefault();
      mainWindow?.hide();
      if (process.platform === 'darwin') {
        // macOS 保活
      } else {
        // Windows/Linux: 第一次隐藏时,弹个托盘通知
        if (tray && !settings.get('trayTipShown', false)) {
          new Notification({
            title: '小红蚁',
            body: '已最小化到托盘,双击托盘图标可恢复主窗口。',
          }).show();
          settings.set('trayTipShown', true);
        }
      }
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log.error(`[Window] did-fail-load: code=${errorCode} ${errorDescription} url=${validatedURL}`);
  });
}

// ============================================================
// 托盘
// ============================================================
function createTray() {
  const iconPath = path.join(__dirname, '..', 'resources', 'tray-icon.png');
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) {
      log.warn('[Tray] 图标加载失败,使用空图标');
    }
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  } catch (e) {
    log.error('[Tray] 创建失败:', e);
    return;
  }

  tray.setToolTip(`小红蚁 v${app.getVersion()}`);

  const refreshMenu = () => {
    tray?.setContextMenu(Menu.buildFromTemplate([
      {
        label: '打开小红蚁',
        click: () => {
          if (!mainWindow) return;
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: autoLaunch.get(),
        click: (item) => {
          autoLaunch.set(item.checked);
        },
      },
      { type: 'separator' },
      {
        label: '检查更新',
        click: () => {
          if (isDev) {
            new Notification({ title: '小红蚁', body: '开发模式无更新检查' }).show();
            return;
          }
          checkForUpdates().then(r => {
            if (!r) new Notification({ title: '小红蚁', body: '已是最新版本' }).show();
          });
        },
      },
      {
        label: '查看日志',
        click: () => shell.openPath(app.getPath('logs')),
      },
      {
        label: '打开数据目录',
        click: () => shell.openPath(app.getPath('userData')),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          setAppQuitting(true);
          quit();
        },
      },
    ]));
  };

  refreshMenu();

  tray.on('double-click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
}

// ============================================================
// IPC 注册
// ============================================================
function setupIPC() {
  // 窗口
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:unmaximize', () => mainWindow?.unmaximize());
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  // 应用
  ipcMain.handle('app:getBackendPort', () => BACKEND_PORT);
  ipcMain.handle('app:getBackendUrl', () => `http://localhost:${BACKEND_PORT}`);
  ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.on('app:quit', () => {
    setAppQuitting(true);
    quit();
  });

  // 文件
  ipcMain.handle('fs:openFile', async (_e, options) => {
    const win = mainWindow || undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: options?.filters,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return { path: result.filePaths[0] };
  });
  ipcMain.handle('fs:saveFile', async (_e, { defaultPath, content, filters }) => {
    const win = mainWindow || undefined;
    const result = await dialog.showSaveDialog(win!, {
      defaultPath,
      filters,
    });
    if (result.canceled || !result.filePath) return null;
    if (content !== undefined) {
      const { promises: fs } = await import('node:fs');
      await fs.writeFile(result.filePath, content, 'utf-8');
    }
    return { path: result.filePath };
  });
  ipcMain.handle('fs:showItemInFolder', (_e, p) => {
    if (typeof p === 'string') shell.showItemInFolder(p);
    return true;
  });

  // 系统
  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });
  ipcMain.on('notification:show', (_e, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title: String(title || ''), body: String(body || '') }).show();
    }
  });

  // 开机自启
  ipcMain.handle('autoLaunch:get', () => autoLaunch.get());
  ipcMain.handle('autoLaunch:set', (_e, enable: boolean) => {
    autoLaunch.set(!!enable);
    return autoLaunch.get();
  });

  // 主题
  ipcMain.handle('theme:get', () => nativeTheme.themeSource);
  ipcMain.handle('theme:set', (_e, mode: 'dark' | 'light' | 'system') => {
    nativeTheme.themeSource = mode;
    return nativeTheme.themeSource;
  });

  // 后端健康
  ipcMain.handle('backend:health', async () => {
    try {
      const res = await fetch(`http://localhost:${BACKEND_PORT}/api/health`);
      if (res.ok) {
        const data = await res.json();
        return { status: 'ok', ...data };
      }
      return { status: 'error', code: res.status };
    } catch (e: any) {
      return { status: 'error', message: e?.message || String(e) };
    }
  });
}

// ============================================================
// 主题同步到渲染进程
// ============================================================
function watchTheme() {
  nativeTheme.on('updated', () => {
    const t = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    mainWindow?.webContents.send('theme:changed', t);
  });
}

// ============================================================
// 退出
// ============================================================
function quit() {
  log.info('[App] 退出中...');
  isQuitting = true;
  setAppQuitting(true);
  unregisterAllShortcuts();
  if (backendProcess) {
    try { backendProcess.kill('SIGTERM'); } catch {}
    setTimeout(() => {
      try { backendProcess?.kill('SIGKILL'); } catch {}
    }, 3000);
  }
  if (tray) {
    try { tray.destroy(); } catch {}
  }
  app.quit();
}

// ============================================================
// App 生命周期
// ============================================================
app.whenReady().then(async () => {
  log.info('[App] ready');

  // CSP(仅生产模式)
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: https: http:; " +
            "media-src 'self' blob: data:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' http://localhost:* ws: https:;",
          ],
        },
      });
    });
  }

  // 加载设置
  await settings.load();

  setupIPC();
  buildAppMenu(() => mainWindow);
  registerShortcuts(() => mainWindow);
  watchTheme();

  log.info('[App] 启动后端...');
  await startBackend();
  log.info('[App] 后端就绪');

  await createWindow();
  createTray();

  // 检测 playwright 浏览器(桌面版 RPA 扫码 + 微博爬虫需要)
  // 用户机器上没装就提示,首次进 RPA 页面会卡
  if (!isDev) {
    setTimeout(() => checkPlaywrightBrowsers().catch(e => log.warn('[Playwright]', e)), 2000);
  }

  // 自动更新(生产)
  if (!isDev) {
    // 延迟 5s 检查,避免阻塞启动
    setTimeout(() => {
      checkForUpdates().catch(e => log.warn('[Updater]', e?.message || e));
    }, 5000);
  }
});

/**
 * 检查 playwright 浏览器是否就位
 * - 装了就静默 OK
 * - 缺了通知前端弹窗(用户可在设置里点"安装")
 */
async function checkPlaywrightBrowsers(): Promise<void> {
  const { existsSync } = await import('node:fs');
  const home = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  const marker = path.join(home, 'ms-playwright');
  try {
    const { readdirSync } = await import('node:fs');
    if (!existsSync(marker)) throw new Error('no ms-playwright');
    const dirs = readdirSync(marker);
    const ok = dirs.some(d => d.startsWith('chromium-') && existsSync(path.join(marker, d, 'INSTALLATION_COMPLETE')));
    if (ok) {
      log.info('[Playwright] 浏览器已就位');
      return;
    }
    throw new Error('chromium not installed');
  } catch (e) {
    log.warn('[Playwright] 浏览器缺失,通知用户');
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('playwright:missing');
    });
    if (Notification.isSupported()) {
      new Notification({
        title: '小红蚁',
        body: 'RPA 扫码登录需要安装浏览器内核(约 100MB),首次进入"账号管理"时会自动下载。',
      }).show();
    }
  }
}

app.on('window-all-closed', () => {
  // macOS 保持托盘,其他平台退出
  if (process.platform !== 'darwin') {
    quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('before-quit', () => {
  setAppQuitting(true);
});

app.on('will-quit', () => {
  unregisterAllShortcuts();
  if (backendProcess) {
    try { backendProcess.kill(); } catch {}
  }
});

// 防止多开渲染
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

/**
 * 如果 userData/.env 里的 JWT_SECRET 还是占位符,生成一个随机强密钥
 * - 防止所有用户共享同一默认密钥(任何人都能伪造 JWT)
 * - 防止用户不修改就上线
 */
function generateJwtSecretIfDefault(envFile: string): void {
  try {
    const txt = readFileSync(envFile, 'utf-8');
    if (!/JWT_SECRET=change_me|JWT_SECRET=your_jwt_secret/.test(txt)) {
      return; // 已经设过
    }
    // 生成 48 字节随机 base64 串(~64 字符)
    const secret = randomBytes(48).toString('base64url');
    const newTxt = txt.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
    writeFileSync(envFile, newTxt, 'utf-8');
    log.info('[Setup] 已为新用户生成独立 JWT_SECRET');
  } catch (e) {
    log.warn('[Setup] 生成 JWT_SECRET 失败:', e);
  }
}
