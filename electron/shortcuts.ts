/**
 * 全局快捷键
 * - 唤起主窗口
 * - 唤起命令面板
 */
import { globalShortcut, BrowserWindow } from 'electron';

export function registerShortcuts(getMain: () => BrowserWindow | null) {
  const showMain = () => {
    const win = getMain();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  };

  // Ctrl/Cmd + Shift + X: 唤起主窗口
  globalShortcut.register('CommandOrControl+Shift+X', () => {
    showMain();
  });

  // 注意: 全局快捷键会消耗系统资源,这里只注册一个必要的
}

export function unregisterAllShortcuts() {
  globalShortcut.unregisterAll();
}
