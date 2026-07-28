#!/usr/bin/env node
/**
 * 功能描述：自动登录小红蚁并截取文档所需的页面截图
 *
 * 使用方式：
 * node scripts/capture-docs-screenshots.mjs
 *
 * 参数说明：
 * - BASE_URL: [string] 前端地址，默认 http://localhost:5173
 * - USERNAME: [string] 管理员用户名
 * - PASSWORD: [string] 管理员密码
 *
 * 返回说明：
 * - 无返回值，截图保存到 docs/assets/screenshots/ 目录
 *
 * 使用示例：
 * BASE_URL=http://localhost:5173 ADMIN_USER=admin ADMIN_PASS=';Ab@123456' node scripts/capture-docs-screenshots.mjs
 *
 * 异常情况：
 * - 页面加载超时 → 检查 dev server 是否运行
 * - 登录失败 → 检查用户名密码
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
// 注意：不能使用 process.env.USERNAME，因为 Windows 系统环境变量 USERNAME 会覆盖默认值
const USERNAME = process.env.ADMIN_USER || 'admin';
const PASSWORD = process.env.ADMIN_PASS || ';Ab@123456';
const OUTPUT_DIR = path.resolve(process.cwd(), 'docs', 'assets', 'screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(page, name, options = {}) {
    const filePath = path.join(OUTPUT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: options.fullPage ?? false });
    console.log(`Captured: ${filePath}`);
    return filePath;
}

/**
 * 功能描述：点击侧边栏导航进行页面切换
 * 通过精确匹配侧边栏 Link 元素，触发 React Router 客户端路由
 */
async function clickNav(page, text) {
    // 侧边栏 Link 结构：固定在左侧 aside 内，文字被包裹在 a > ... > span 中
    const locator = page.locator('aside a').filter({ hasText: new RegExp(`^${text}$`) }).first();
    if (await locator.isVisible().catch(() => false)) {
        await locator.click();
        await sleep(1500);
        return true;
    }
    console.warn(`Sidebar link for "${text}" not found, falling back to navigateTo`);
    return false;
}

/**
 * 功能描述：客户端路由导航（不刷新页面，保持 Zustand 内存 token）
 * 通过触发 React Router 内部监听事件实现
 */
async function navigateTo(page, route, waitSelector) {
    await page.evaluate((r) => {
        // React Router v6 BrowserRouter 监听 popstate 事件，
        // 但 pushState 不会触发 popstate，因此使用 replaceState + 自定义事件
        const originalUrl = window.location.href;
        window.history.pushState({}, '', r);
        // 派发 popstate 事件，但需包含正确的 state
        const popEvent = new PopStateEvent('popstate', { state: {} });
        window.dispatchEvent(popEvent);
        // 如果 popstate 未触发路由，使用 hash 变更作为兜底
        if (window.location.pathname !== r && !window.location.href.includes('#')) {
            window.location.hash = 'navigate';
            window.location.hash = '';
        }
    }, route);
    await sleep(800);
    if (waitSelector) {
        await page.waitForSelector(waitSelector, { timeout: 10000 }).catch(() => {
            console.warn(`Wait for selector "${waitSelector}" on route ${route} timed out`);
        });
    }
    await sleep(1000);
}

async function safeScreenshot(locator, filename) {
    try {
        if (await locator.isVisible({ timeout: 3000 }).catch(() => false)) {
            await locator.screenshot({ path: path.join(OUTPUT_DIR, filename) });
            console.log(`Captured: ${filename}`);
            return true;
        }
    } catch (e) {
        console.warn(`Skipped ${filename}:`, e.message);
    }
    return false;
}

/**
 * 功能描述：通过前端 API 登录并写入 Zustand store，用于新页面导航后恢复登录态
 * 注意：token 仅保存在 JS 内存中，所以每次 page.goto 后都需要重新登录一次
 */
async function restoreLogin(page) {
    const result = await page.evaluate(async ([baseUrl, username, password]) => {
        try {
            const resp = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await resp.json();
            if (!data.token) {
                return { success: false, error: data.error || 'No token in response' };
            }
            // 触发 useAuthStore 的 login action
            if (window.__authStore && typeof window.__authStore.login === 'function') {
                window.__authStore.login(data.token, data.user);
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }, [BASE_URL, USERNAME, PASSWORD]);

    if (!result.success) {
        throw new Error(`Restore login failed: ${result.error}`);
    }
    // 等待 React 重新渲染
    await sleep(800);
}

/**
 * 功能描述：使用 React Router 暴露的 navigate 函数切换路由
 */
async function navigateWithRouter(page, route) {
    await page.evaluate((r) => {
        if (window.__appNavigate) {
            window.__appNavigate(r);
        } else {
            window.location.href = r;
        }
    }, route);
    await sleep(1500);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
        // 1. 登录页
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        await sleep(2000);
        await capture(page, 'login-page');

        // 2. 登录
        // 等待输入框渲染
        await page.waitForSelector('input[type="text"]', { timeout: 15000 });
        await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        const usernameInput = page.locator('input[type="text"]').first();
        const passwordInput = page.locator('input[type="password"]').first();
        await usernameInput.fill(USERNAME);
        await passwordInput.fill(PASSWORD);
        await page.click('button[type="submit"]');

        try {
            await page.waitForURL(`${BASE_URL}/`, { timeout: 15000 });
            console.log('Login successful, navigated to dashboard');
        } catch {
            const errText = await page.textContent('.text-danger').catch(() => 'No error element');
            console.error('Login failed:', errText);
            await capture(page, 'login-failed');
            throw new Error('Login failed');
        }
        await sleep(1500);

        // 3. 首页/仪表盘
        await capture(page, 'dashboard-overview', { fullPage: true });

        // 4. 侧边栏导航特写
        await safeScreenshot(page.locator('aside, nav[role="navigation"]').first(), 'sidebar-nav.png');

        // 5. 账号矩阵
        await navigateWithRouter(page, '/accounts');
        await capture(page, 'account-matrix', { fullPage: true });

        await safeScreenshot(
            page.locator('button').filter({ hasText: /绑定浏览/ }).first(),
            'bind-preview-btn.png'
        );
        await safeScreenshot(
            page.locator('button').filter({ hasText: /设为活跃|活跃/ }).first(),
            'set-active-account.png'
        );

        // 6. 对标账号监控
        await navigateWithRouter(page, '/competitor');
        await capture(page, 'competitor-monitor', { fullPage: true });

        await safeScreenshot(
            page.locator('a, button').filter({ hasText: /添加对标账号/ }).first(),
            'add-competitor-btn.png'
        );

        // 7. 添加对标账号页面
        await navigateWithRouter(page, '/competitor/add');
        await capture(page, 'competitor-add-page', { fullPage: true });
        await safeScreenshot(page.locator('input[type="text"]').first(), 'competitor-url-input.png');

        // 8. 内容创作 - 笔记生成
        await navigateWithRouter(page, '/generate');
        await capture(page, 'content-generation', { fullPage: true });
        await safeScreenshot(page.locator('form').first(), 'note-generation-form.png');

        // 9. 设置 - AI 模型配置
        await navigateWithRouter(page, '/settings');
        await capture(page, 'settings-page', { fullPage: true });

        const systemTab = page.locator('button').filter({ hasText: /系统配置/ }).first();
        if (await systemTab.isVisible().catch(() => false)) {
            await systemTab.click();
            await sleep(1000);
            await safeScreenshot(page.locator('label').filter({ hasText: /DASHSCOPE/ }).first().locator('..'), 'ai-provider-settings.png');
        }

        // 10. 热门笔记
        await navigateWithRouter(page, '/gallery');
        // 等待数据加载完成
        await page.waitForSelector('text=加载热门笔记中...', { state: 'detached', timeout: 15000 }).catch(() => {
            console.warn('Trending notes still loading, capturing current state');
        });
        await sleep(800);
        await capture(page, 'trending-notes', { fullPage: true });

        // 11. 视频脚本标签
        await navigateWithRouter(page, '/generate');
        const videoScriptTab = page.locator('button').filter({ hasText: /视频脚本/ }).first();
        if (await videoScriptTab.isVisible().catch(() => false)) {
            await videoScriptTab.click();
            await sleep(1000);
            await capture(page, 'video-script-form', { fullPage: true });
        }

        // 12. 笔记管理
        await navigateWithRouter(page, '/notes');
        await capture(page, 'note-management', { fullPage: true });

        // 13. 草稿箱
        await navigateWithRouter(page, '/drafts');
        await capture(page, 'drafts', { fullPage: true });

        // 14. 任务中心
        await navigateWithRouter(page, '/tasks');
        await capture(page, 'task-center', { fullPage: true });

        // 15. 数据看板
        await navigateWithRouter(page, '/analytics');
        await capture(page, 'analytics-dashboard', { fullPage: true });

        // 16. 互动中心（评论 / AI 回复）
        await navigateWithRouter(page, '/engagement');
        await capture(page, 'engagement-center', { fullPage: true });

        // 17. 视频工程
        await navigateWithRouter(page, '/video-projects');
        await capture(page, 'video-projects', { fullPage: true });

        // 18. 选题挖掘
        await navigateWithRouter(page, '/topic-mining');
        await capture(page, 'topic-mining', { fullPage: true });

        // 19. 我的爆款
        await navigateWithRouter(page, '/knowledge');
        await capture(page, 'viral-knowledge', { fullPage: true });

        console.log('\nAll screenshots saved to:', OUTPUT_DIR);
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();
