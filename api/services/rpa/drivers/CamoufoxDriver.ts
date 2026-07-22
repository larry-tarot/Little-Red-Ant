/**
 * CamoufoxDriver —— 实验性 driver,默认 NOT 启用。
 *
 * 背景:Camoufox (https://github.com/HyperG9n/Camoufox) 是基于 Firefox
 * 的抗指纹浏览器,2025 年开始受到关注。它的优势是原生处理 Canvas/WebGL
 * 指纹,不需要 puppeteer-extra-plugin-stealth 这样的运行时打补丁方案。
 *
 * 集成难点:
 *   1. Camoufox 主要 API 是 Python,Node 端需要走 playwright-core 的 firefox
 *      通道 + executablePath。Kaliiiiiiiiii-Vinyzu/Playwright-Browser-bridge
 *      是 2025 年才出现的桥接项目,生态尚不成熟。
 *   2. npm 上 camoufox-js 包可能不存在(截至 2026-07)。
 *
 * 因此,本类目前是"接口完整 + 真实启动失败并抛出友好错误"的占位实现。
 * 用户如果在 .env 设置 RPA_DRIVER=camoufox,会在第一次启动时看到明确的
 * 错误信息,引导其要么切回 Playwright,要么自行 fork bridge。
 *
 * 一旦 camoufox-js 可用,只需替换 getExecutablePath() 的返回即可启用。
 */

import { Logger } from '../../LoggerService.js';
import type { IBrowserDriver, GetPageOptions, AuthenticatedPage } from '../interfaces/IBrowserDriver.js';

export class CamoufoxDriver implements IBrowserDriver {
    public readonly driverName = 'camoufox';

    public async getAuthenticatedPage(_opts: GetPageOptions): Promise<AuthenticatedPage> {
        // Defer expensive import / detection to the moment of actual use, so the
        // server still boots even when Camoufox is configured but unavailable.
        const executablePath = await this.getExecutablePath();
        if (!executablePath) {
            throw new Error(
                '[CamoufoxDriver] Camoufox 二进制未找到。\n' +
                '原因:`camoufox-js` 包在 npm 上不可用,或未配置 CAMOUFOX_EXECUTABLE_PATH 环境变量。\n' +
                '解决方案:1) 设置 RPA_DRIVER=playwright 切换到默认驱动;或\n' +
                '         2) 从 https://github.com/HyperG9n/Camoufox 自行下载二进制并设置环境变量。'
            );
        }

        // Once camoufox-js is available, replace this block with:
        //   import { firefox } from 'playwright-core';
        //   const context = await firefox.launchPersistentContext(userDataDir, {
        //       executablePath, headless: opts.headless, ...
        //   });
        throw new Error('[CamoufoxDriver] 桥接实现尚未完成,等待 camoufox-js 生态成熟。');
    }

    public async closeAll(): Promise<void> {
        Logger.info('CamoufoxDriver', 'closeAll() — no persistent contexts to close');
    }

    private async getExecutablePath(): Promise<string | null> {
        // 1) Explicit env var override (most likely path forward)
        if (process.env.CAMOUFOX_EXECUTABLE_PATH) {
            const fs = await import('fs');
            if (fs.existsSync(process.env.CAMOUFOX_EXECUTABLE_PATH)) {
                return process.env.CAMOUFOX_EXECUTABLE_PATH;
            }
        }
        // 2) Probe npm package (likely absent)
        try {
            // Dynamic import so a missing package doesn't break server boot.
            const mod = await import('camoufox-js' as string).catch(() => null);
            if (mod && (mod as any).executablePath) {
                return await (mod as any).executablePath();
            }
        } catch {
            // ignore
        }
        return null;
    }
}
