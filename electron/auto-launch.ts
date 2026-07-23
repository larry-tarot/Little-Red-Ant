/**
 * 开机自启管理
 * - 桌面版安装时让用户选择是否开机自启
 * - 用 app.setLoginItemSettings (Windows / macOS 都支持)
 */
import { app } from 'electron';

const STORAGE_KEY = 'autoLaunch';

export const autoLaunch = {
  get(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  },
  set(enable: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true,    // 后台启动不弹窗
      args: ['--hidden'],
    });
    // 持久化标记
    try {
      const { settings } = require('./settings-store');
      settings.set(STORAGE_KEY, enable);
    } catch {
      // ignore
    }
  },
};
