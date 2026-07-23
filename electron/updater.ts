/**
 * electron-updater 包装
 * 发布渠道: GitHub Releases (publish.generic)
 * 用户在托盘/菜单点"检查更新" -> checkForUpdates
 * 有新版本 -> 下载 -> 通知用户 -> install 后重启
 */
import log from 'electron-log';
import pkg from 'electron-updater';
import { app, BrowserWindow, Notification } from 'electron';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

const { autoUpdater } = pkg;

let isChecking = false;

autoUpdater.logger = log;
autoUpdater.autoDownload = false; // 手动确认后下载
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => log.info('[Updater] 检查更新...'));
autoUpdater.on('update-available', (info: UpdateInfo) => {
  log.info(`[Updater] 有新版本: ${info.version}`);
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('update:available', { version: info.version });
  });
  if (Notification.isSupported()) {
    new Notification({
      title: '小红蚁',
      body: `发现新版本 ${info.version},正在后台下载...`,
    }).show();
  }
  // 自动开始下载
  autoUpdater.downloadUpdate().catch(e => log.error('[Updater] download error:', e));
});
autoUpdater.on('download-progress', (p: ProgressInfo) => {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('update:progress', { percent: p.percent });
  });
});
autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
  log.info(`[Updater] 已下载: ${info.version}`);
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('update:downloaded', { version: info.version });
  });
  if (Notification.isSupported()) {
    new Notification({
      title: '小红蚁',
      body: `新版本 ${info.version} 已下载完成,点击立即安装并重启。`,
    }).on('click', () => {
      (app as any).isQuitting = true;
      autoUpdater.quitAndInstall();
    }).show();
  }
});
autoUpdater.on('error', (err) => {
  log.error('[Updater] error:', err?.message || err);
  isChecking = false;
});

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  if (isChecking) return null;
  isChecking = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    isChecking = false;
    return result?.updateInfo || null;
  } catch (e) {
    isChecking = false;
    log.error('[Updater] check failed:', e);
    return null;
  }
}
