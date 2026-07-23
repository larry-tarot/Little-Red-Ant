/**
 * 简单的 key-value 持久化(用 userData 下的 JSON 文件)
 * 用于保存: 开机自启、自动更新策略、主题模式等
 * 不放敏感数据
 */
import { app } from 'electron';
import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

class SettingsStore {
  private data: Record<string, any> = {};
  private filePath: string;
  private loaded = false;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'settings.json');
  }

  async load() {
    try {
      if (existsSync(this.filePath)) {
        const txt = await fs.readFile(this.filePath, 'utf-8');
        this.data = JSON.parse(txt);
      } else {
        const dir = path.dirname(this.filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }
    } catch (e) {
      console.error('[SettingsStore] load failed:', e);
      this.data = {};
    }
    this.loaded = true;
    return this.data;
  }

  get<T = any>(key: string, def?: T): T {
    if (!this.loaded) {
      // 同步读(简化)
      try {
        if (existsSync(this.filePath)) {
          const txt = require('node:fs').readFileSync(this.filePath, 'utf-8');
          this.data = JSON.parse(txt);
          this.loaded = true;
        }
      } catch {}
    }
    return this.data[key] ?? def;
  }

  async set(key: string, value: any) {
    this.data[key] = value;
    await this.persist();
  }

  private async persist() {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SettingsStore] persist failed:', e);
    }
  }
}

export const settings = new SettingsStore();
