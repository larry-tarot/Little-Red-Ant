/**
 * 单实例锁: 第二次启动时聚焦已有窗口
 * 避免用户双击图标打开多个小红蚁进程
 */
import { app, BrowserWindow } from 'electron';

export function setupSingleInstance(): boolean {
  const got = app.requestSingleInstanceLock();
  if (!got) return false;

  app.on('second-instance', (_event, _argv, _cwd) => {
    const wins = BrowserWindow.getAllWindows();
    const main = wins[0];
    if (!main) return;
    if (main.isMinimized()) main.restore();
    if (!main.isVisible()) main.show();
    main.focus();
  });

  return true;
}
