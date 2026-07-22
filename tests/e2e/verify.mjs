/**
 * E2E verification — checks that the core user flow works.
 * Focuses on real browser behavior, not HTTP status codes.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenzc/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe',
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let pageErrors = 0;
page.on('pageerror', () => { pageErrors++; });

const results = [];
function log(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ': ' + detail : ''}`);
}

// 1. Login
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[type="text"]', 'admin');
await page.fill('input[type="password"]', 'admin');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);
const afterLogin = page.url();
log('Login redirect', !afterLogin.includes('/login'), afterLogin);

// 2. Core pages
const pages = ['/tasks', '/accounts', '/engagement', '/gallery', '/settings', '/generate', '/analytics'];
for (const path of pages) {
    pageErrors = 0;
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const notLoggedOut = !page.url().includes('/login');
    log(path, notLoggedOut && pageErrors === 0, pageErrors > 0 ? `${pageErrors} error(s)` : '');
}

// 3. Sidebar navigation
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const navLinks = await page.locator('nav a, aside a, [class*="sidebar"] a').count();
log('Sidebar nav links', navLinks > 10, `count: ${navLinks}`);

// 4. Auth persistence
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
const stayedLoggedIn = !page.url().includes('/login');
log('Auth persistence', stayedLoggedIn);

// 5. Summary
const passed = results.filter(r => r.ok).length;
const total = results.length;
console.log(`\n=== ${passed}/${total} passed ===`);

await browser.close();
process.exit(passed === total ? 0 : 1);