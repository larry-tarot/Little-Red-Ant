import { chromium } from 'playwright';

const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenzc/AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const sseResponses = [];
page.on('response', r => {
    if (r.url().includes('/events')) {
        sseResponses.push(`SSE: ${r.status()} ${r.url()}`);
    }
});

// 登录
await page.goto('http://localhost:5173/login');
await page.waitForSelector('input[type="text"]', { timeout: 10000 });
await page.fill('input[type="text"]', 'admin');
await page.fill('input[type="password"]', 'admin');
await page.click('button[type="submit"]');
await page.waitForURL(/\/(?!login)/, { timeout: 10000 });
await page.waitForTimeout(2000);
console.log('After login:', page.url());

// 触发一个 SSE 任务
const triggerResp = await page.request.post('http://localhost:3001/api/accounts/check-health', {
    headers: { 'Content-Type': 'application/json' },
    data: { accountId: 1 }
});
const triggerJson = await triggerResp.json();
const taskId = triggerJson.taskId;
console.log('Task triggered:', taskId);

// 跳转到 Tasks
await page.goto('http://localhost:5173/tasks', { waitUntil: 'networkidle' });
console.log('On Tasks page:', page.url());
await page.waitForTimeout(4000);
await page.screenshot({ path: 'debug/e2e/tasks-with-sse.png', fullPage: true });
console.log('Screenshot saved');

console.log('=== SSE connections established ===');
sseResponses.forEach(r => console.log(r));

await browser.close();
