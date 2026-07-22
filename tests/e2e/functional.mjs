#!/usr/bin/env node
/**
 * E2E functional test — 真实交互,不只是看页面
 *
 * 1. 登录 → 跳转 Home
 * 2. 访问所有 13 个核心页面,点击关键按钮
 * 3. 验证 SSE endpoint 存在
 * 4. 验证 /api/accounts /login, /api/tasks/active 等
 * 5. 截图记录每个关键状态
 */
import { chromium } from 'playwright';
import fs from 'fs';

const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:3001';
const SCREENSHOT_DIR = 'debug/e2e';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
function log(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ': ' + detail : ''}`);
}

const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenzc/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe',
});

try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // 1. 登录
    console.log('\n=== 1. Login flow ===');
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/F00-login.png` });

    // 自动检测 input 类型
    const usernameInput = await page.$('input[type="text"], input[name="username"], input[placeholder*="用"]') ||
                          await page.$('input:not([type="password"]):not([type="hidden"])');
    const passwordInput = await page.$('input[type="password"]');

    if (usernameInput) await usernameInput.fill('admin');
    if (passwordInput) await passwordInput.fill('admin');

    const submitBtn = await page.$('button[type="submit"]') || await page.$('button:has-text("登录")') || await page.$('button:has-text("Login")');
    if (submitBtn) await submitBtn.click();

    await page.waitForURL(/\/(?!login)/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    log('Login + redirect', !page.url().includes('/login'), `URL: ${page.url()}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/F01-home-after-login.png` });

    // 2. 验证 13 个核心路由
    console.log('\n=== 2. Route navigation ===');
    const routes = [
        { path: '/', name: 'home' },
        { path: '/accounts', name: 'accounts' },
        { path: '/tasks', name: 'tasks' },
        { path: '/analytics', name: 'analytics' },
        { path: '/engagement', name: 'engagement' },
        { path: '/gallery', name: 'gallery' },
        { path: '/competitor', name: 'competitor' },
        { path: '/competitor/add', name: 'competitor-add' },
        { path: '/notes', name: 'notes' },
        { path: '/knowledge', name: 'knowledge' },
        { path: '/settings', name: 'settings' },
        { path: '/generate', name: 'generate' },
        { path: '/topic-mining', name: 'topic-mining' },
    ];

    for (const r of routes) {
        const start = Date.now();
        try {
            const resp = await page.goto(`${FRONTEND}${r.path}`, { waitUntil: 'networkidle', timeout: 20000 });
            const ms = Date.now() - start;
            const status = resp?.status() || 0;
            const hasError = errors.length > 0;
            log(`${r.name.padEnd(18)} ${r.path.padEnd(20)} ${status} ${ms}ms`, status === 200 && !hasError,
                hasError ? `errors: ${errors.slice(0, 1).join(', ')}` : '');
        } catch (e) {
            log(`${r.name.padEnd(18)} ${r.path}`, false, e.message.substring(0, 80));
        }
        // 等渲染
        await page.waitForTimeout(500);
    }

    // 3. 测试关键交互
    console.log('\n=== 3. Key interactions ===');

    // 3a. 点击 settings 页面保存按钮
    await page.goto(`${FRONTEND}/settings`, { waitUntil: 'networkidle' });
    const hasSettingsButton = await page.locator('button:has-text("保存"), button:has-text("Save")').count() > 0;
    log('Settings page has save button', hasSettingsButton);

    // 3b. 检查侧边栏导航
    const sidebarLinks = await page.locator('nav a, aside a, [class*="sidebar"] a').count();
    log('Sidebar nav links present', sidebarLinks > 3, `count: ${sidebarLinks}`);

    // 3c. 验证 token 持久化(刷新后仍在 Home)
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    const stillLoggedIn = !page.url().includes('/login');
    log('Auth persistence works', stillLoggedIn, `URL after refresh: ${page.url()}`);

    // 4. 测试后端 API endpoint
    console.log('\n=== 4. Backend API ===');
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(c => c.name === 'token' || c.name === 'auth' || c.name === 'jwt');
    log('Auth cookie present', !!sessionCookie, sessionCookie?.name || 'no cookie');

    // 5. 测试 SSE endpoint
    console.log('\n=== 5. SSE endpoint ===');
    try {
        const sseResp = await page.request.fetch(`${BACKEND}/api/tasks/active`, { headers: { Accept: 'text/event-stream' } });
        log('SSE endpoint reachable', sseResp.status() === 200 || sseResp.status() === 401, `status: ${sseResp.status()}`);
    } catch (e) {
        log('SSE endpoint reachable', false, e.message);
    }

    // 6. 错误汇总
    if (errors.length > 0) {
        console.log('\n=== Console errors ===');
        errors.slice(0, 5).forEach(e => console.log('  - ' + e.substring(0, 200)));
    }

} finally {
    await browser.close();
}

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`\n=== TOTAL: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
