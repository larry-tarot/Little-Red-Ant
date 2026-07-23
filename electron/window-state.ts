/**
 * 窗口状态持久化(位置/大小/最大化)
 * 重启后还原用户上次关闭时的状态
 *
 * 注意: 不能在模块顶层 new WindowStateKeeper(),
 * 因为构造函数用 screen.getAllDislays() 必须在 app ready 之后
 * 所以用 lazy 初始化,统一在 init() 中创建
 */
import { app, BrowserWindow, screen } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const DEFAULTS: WindowState = {
  width: 1400,
  height: 900,
  isMaximized: false,
};

export class WindowStateKeeper {
  private state: WindowState = { ...DEFAULTS };
  private filePath: string;
  private inited = false;

  constructor(filename = 'window-state.json') {
    // 注意: 这里只算 filePath,不调 screen
    this.filePath = path.join(app.getPath('userData'), filename);
  }

  /** 必须在 app.whenReady() 之后调用一次,完成屏幕校验 */
  init() {
    if (this.inited) return;
    this.inited = true;
    try {
      if (existsSync(this.filePath)) {
        const txt = readFileSync(this.filePath, 'utf-8');
        this.state = { ...DEFAULTS, ...JSON.parse(txt) };
      }
    } catch (e) {
      console.warn('[WindowState] load failed:', e);
    }
    // 校验窗口是否还在屏幕上(显示器拔了的话重置)
    if (this.state.x !== undefined && this.state.y !== undefined) {
      try {
        const displays = screen.getAllDisplays();
        const visible = displays.some(d => {
          const a = d.workArea;
          return this.state.x! >= a.x && this.state.x! <= a.x + a.width
            && this.state.y! >= a.y && this.state.y! <= a.y + a.height;
        });
        if (!visible) {
          this.state.x = undefined;
          this.state.y = undefined;
        }
      } catch (e) {
        // 兜底:如果 screen 不可用,保留原坐标
        console.warn('[WindowState] screen check failed:', e);
      }
    }
  }

  getOptions(): Partial<Electron.BrowserWindowConstructorOptions> {
    return {
      x: this.state.x,
      y: this.state.y,
      width: this.state.width,
      height: this.state.height,
    };
  }

  manage(win: BrowserWindow) {
    const save = () => {
      try {
        if (!win.isDestroyed()) {
          this.state.isMaximized = win.isMaximized();
          if (!this.state.isMaximized) {
            const b = win.getBounds();
            this.state.x = b.x;
            this.state.y = b.y;
            this.state.width = b.width;
            this.state.height = b.height;
          }
          const dir = path.dirname(this.filePath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
        }
      } catch (e) {
        console.error('[WindowState] save failed:', e);
      }
    };
    win.on('resize', save);
    win.on('move', save);
    win.on('close', save);

    if (this.state.isMaximized) {
      win.maximize();
    }
  }
}
