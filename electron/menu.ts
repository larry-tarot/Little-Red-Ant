/**
 * 原生应用菜单(文件/编辑/视图/帮助)
 * - macOS 自动显示在系统菜单栏
 * - Windows 显示在窗口顶部(frame: false 时通过 IPC 暴露给渲染进程自行渲染)
 */
import { app, Menu, MenuItemConstructorOptions, BrowserWindow, shell } from 'electron';

export function buildAppMenu(getMain: () => BrowserWindow | null) {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: '关于小红蚁' } as MenuItemConstructorOptions,
            { type: 'separator' } as MenuItemConstructorOptions,
            { role: 'services' } as MenuItemConstructorOptions,
            { type: 'separator' } as MenuItemConstructorOptions,
            { role: 'hide' } as MenuItemConstructorOptions,
            { role: 'hideOthers' } as MenuItemConstructorOptions,
            { role: 'unhide' } as MenuItemConstructorOptions,
            { type: 'separator' } as MenuItemConstructorOptions,
            { role: 'quit' } as MenuItemConstructorOptions,
          ],
        }]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建草稿',
          accelerator: 'CmdOrCtrl+N',
          click: () => getMain()?.webContents.send('menu:new-draft'),
        },
        {
          label: 'AI 创作',
          accelerator: 'CmdOrCtrl+G',
          click: () => getMain()?.webContents.send('menu:navigate', '/generate'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        {
          label: '查找',
          accelerator: 'CmdOrCtrl+F',
          click: () => getMain()?.webContents.send('menu:find'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          click: () => getMain()?.webContents.reload(),
        },
        {
          label: '强制重载',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => getMain()?.webContents.reloadIgnoringCache(),
        },
        { type: 'separator' },
        {
          label: '开发者工具',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => getMain()?.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        {
          label: '命令面板',
          accelerator: 'CmdOrCtrl+K',
          click: () => getMain()?.webContents.send('menu:command-palette'),
        },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '窗口',
      role: 'windowMenu',
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于小红蚁',
          click: () => getMain()?.webContents.send('menu:about'),
        },
        {
          label: '访问 GitHub',
          click: () => shell.openExternal('https://github.com/magicCzc/Little-Red-Ant'),
        },
        { type: 'separator' },
        {
          label: '查看日志',
          click: () => {
            const win = getMain();
            if (win) {
              const { shell } = require('electron');
              shell.openPath(app.getPath('logs'));
            }
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
