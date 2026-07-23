/**
 * 深链协议: 注册 xiaohongyi:// 让浏览器/外部链接能跳进应用
 * 例如: xiaohongyi://open?route=/generate&noteId=xxx
 */
import { app, BrowserWindow } from 'electron';
import path from 'path';

const SCHEME = 'xiaohongyi';

export function registerProtocol() {
  // dev:通过 electron . 启动
  // prod:通过打包后的 exe
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(SCHEME, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }

  // macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // Windows / Linux: 第二次启动时从 argv 拿
  const url = process.argv.find(a => a.startsWith(`${SCHEME}://`));
  if (url) {
    app.whenReady().then(() => handleDeepLink(url));
  }
}

function handleDeepLink(url: string) {
  try {
    const u = new URL(url);
    const route = u.searchParams.get('route') || u.host || '/';
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      win.webContents.send('deeplink:navigate', { route, params: Object.fromEntries(u.searchParams) });
    }
  } catch (e) {
    console.error('[Protocol] Invalid deep link:', url, e);
  }
}
