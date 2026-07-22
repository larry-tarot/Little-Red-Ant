#!/usr/bin/env node
/**
 * E2E smoke test — visit each major page, screenshot, look for runtime errors.
 * Goal: catch client-side crashes (TypeScript runtime errors, failed imports,
 * React render errors) before manual testing.
 *
 * Usage: node tests/e2e/smoke.mjs
 * Assumes: backend on :3001 and frontend on :5173 already running.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:3001';
const SCREENSHOT_DIR = 'debug/e2e';

const PAGES = [
    { name: 'login', path: '/login', requiresAuth: false },
    { name: 'home', path: '/', requiresAuth: true },
    { name: 'tasks', path: '/tasks', requiresAuth: true },
    { name: 'analytics', path: '/analytics', requiresAuth: true },
    { name: 'accounts', path: '/accounts', requiresAuth: true },
    { name: 'drafts', path: '/drafts', requiresAuth: true },
    { name: 'settings', path: '/settings', requiresAuth: true },
    { name: 'engagement', path: '/engagement', requiresAuth: true },
    { name: 'generate', path: '/generate', requiresAuth: true },
    { name: 'topic-mining', path: '/topic-mining', requiresAuth: true },
    { name: 'gallery', path: '/gallery', requiresAuth: true },
    { name: 'competitor', path: '/competitor', requiresAuth: true },
    { name: 'notes', path: '/notes', requiresAuth: true },
    { name: 'knowledge', path: '/knowledge', requiresAuth: true },
    { name: 'video-projects', path: '/video-projects', requiresAuth: true },
    { name: 'assets', path: '/assets', requiresAuth: true },
    { name: 'prompt-optimizer', path: '/prompt-optimizer', requiresAuth: true },
    { name: 'users', path: '/users', requiresAuth: true },
];

const results = [];

async function main() {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const browser = await chromium.launch({
        headless: true,
        // Playwright 1.57 looks for chromium-1200, but we have 1187 installed.
        // Explicitly point to the existing binary to avoid the version mismatch.
        executablePath: 'C:/Users/chenzc/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe',
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Capture console errors and page errors
    const consoleErrors = [];
    const pageErrors = [];
    const networkErrors = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });
    page.on('pageerror', (err) => {
        pageErrors.push(err.message);
    });
    page.on('response', (res) => {
        if (res.status() >= 500) {
            networkErrors.push(`${res.status()} ${res.url()}`);
        }
    });

    // Step 1: Health check both servers
    try {
        const health = await page.request.get(`${BACKEND}/api/health`);
        if (health.status() !== 200) throw new Error(`Backend health ${health.status()}`);
        console.log('✅ Backend healthy');
    } catch (e) {
        console.error('❌ Backend not reachable:', e.message);
        process.exit(1);
    }

    try {
        await page.request.get(FRONTEND);
        console.log('✅ Frontend reachable');
    } catch (e) {
        console.error('❌ Frontend not reachable:', e.message);
        process.exit(1);
    }

    // Step 2: Login
    console.log('\n=== Login flow ===');
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/00-login.png` });

    // Try multiple selectors for the username/password inputs
    const usernameInput = await page.$('input[name="username"]') ||
                          await page.$('input[placeholder*="用户"]') ||
                          await page.$('input[type="text"]');
    const passwordInput = await page.$('input[type="password"]');

    if (!usernameInput || !passwordInput) {
        console.error('❌ Login inputs not found');
        await page.screenshot({ path: `${SCREENSHOT_DIR}/00-login-fail.png` });
        process.exit(1);
    }

    await usernameInput.fill('admin');
    await passwordInput.fill('admin');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('✅ Login submitted');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-after-login.png` });

    // Step 3: Visit each page
    console.log('\n=== Page visits ===');
    for (const p of PAGES) {
        if (p.name === 'login') continue; // already done
        const startErrors = consoleErrors.length + pageErrors.length;
        try {
            await page.goto(`${FRONTEND}${p.path}`, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(1500); // let lazy chunks + data load
            const newErrors = consoleErrors.length + pageErrors.length - startErrors;
            const screenshot = `${SCREENSHOT_DIR}/${p.name}.png`;
            await page.screenshot({ path: screenshot, fullPage: false });
            const status = newErrors === 0 ? '✅' : '⚠️';
            console.log(`${status} ${p.name.padEnd(20)} ${newErrors === 0 ? 'OK' : `${newErrors} console error(s)`}`);
            results.push({ page: p.name, status: newErrors === 0 ? 'ok' : 'warn', errors: newErrors });
        } catch (e) {
            console.log(`❌ ${p.name.padEnd(20)} ${e.message.split('\n')[0]}`);
            results.push({ page: p.name, status: 'fail', errors: 1, detail: e.message });
            try { await page.screenshot({ path: `${SCREENSHOT_DIR}/${p.name}-FAIL.png` }); } catch {}
        }
    }

    await browser.close();

    // Summary
    console.log('\n=== Summary ===');
    const ok = results.filter(r => r.status === 'ok').length;
    const warn = results.filter(r => r.status === 'warn').length;
    const fail = results.filter(r => r.status === 'fail').length;
    console.log(`Pages OK: ${ok}/${results.length}`);
    console.log(`Pages with warnings: ${warn}`);
    console.log(`Pages failed: ${fail}`);

    if (consoleErrors.length > 0) {
        console.log('\n=== Top 10 console errors ===');
        const unique = [...new Set(consoleErrors)].slice(0, 10);
        unique.forEach((e, i) => console.log(`[${i + 1}] ${e.slice(0, 200)}`));
    }

    if (pageErrors.length > 0) {
        console.log('\n=== Top 10 page errors ===');
        const unique = [...new Set(pageErrors)].slice(0, 10);
        unique.forEach((e, i) => console.log(`[${i + 1}] ${e.slice(0, 200)}`));
    }

    if (networkErrors.length > 0) {
        console.log('\n=== Top 10 network 5xx ===');
        const unique = [...new Set(networkErrors)].slice(0, 10);
        unique.forEach((e, i) => console.log(`[${i + 1}] ${e}`));
    }

    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(2);
});
