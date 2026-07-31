
import { chromium, Browser } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DATA_DIR = path.join(__dirname, '../../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const COMMON_ARGS = [
    '--start-maximized', 
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox'
];

export async function launchBrowser(headless: boolean = false) {
    // 自动检测无图形环境（Docker / Linux 服务器）
    const isHeadless = headless || process.env.HEADLESS === 'true' || (process.platform === 'linux' && !process.env.DISPLAY);
    return await chromium.launch({
        headless: isHeadless,
        channel: 'chrome',
        args: COMMON_ARGS
    });
}

export async function createBrowserContext(browser: Browser, storageState?: any) {
    const context = await browser.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        storageState: (storageState?.cookies || storageState?.origins) ? storageState : undefined
    });
    
    if (Array.isArray(storageState)) {
        await context.addCookies(storageState);
    }
    
    return context;
}
