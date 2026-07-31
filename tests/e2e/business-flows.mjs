/**
 * 核心业务闭环 E2E 验证脚本
 *
 * 目标：验证「创作 → 草稿 → 发布/定时发布」主链路在 UI 层的可用性。
 * 为避免依赖真实 AI 生成与小红书账号，本脚本通过 API 预置草稿，
 * 再通过 Playwright 验证用户在前端的操作闭环。
 *
 * 运行前请确保前后端已启动：
 *   npm run dev
 * 然后执行：
 *   node tests/e2e/business-flows.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
const API = 'http://localhost:14753';
const SCREENSHOT_DIR = 'debug/e2e/business-flows';

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
    const file = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
}

async function apiLogin() {
    const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: ';Ab@123456' }),
    });
    if (!res.ok) {
        throw new Error(`Login failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.token;
}

async function apiCreateDraft(token, draft) {
    const res = await fetch(`${API}/api/drafts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(draft),
    });
    if (!res.ok) {
        throw new Error(`Create draft failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

async function apiDeleteDraft(token, id) {
    await fetch(`${API}/api/drafts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
    });
}

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    process.exit(1);
});

(async () => {
    console.log('Starting business flows test...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const globalErrors = [];
    page.on('pageerror', err => globalErrors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') globalErrors.push(msg.text());
    });

    const results = [];
    const record = (name, ok, detail = '') => {
        results.push({ name, ok, detail });
        console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
    };

    let token;
    let createdDraftId;

    try {
        // ===== 0. 准备：登录并创建测试草稿 =====
        token = await apiLogin();
        const draft = await apiCreateDraft(token, {
            title: 'E2E 测试草稿 - 自动化验证',
            content: '这是一段由 E2E 脚本写入的测试内容，用于验证草稿箱的搜索、筛选与定时发布流程。',
            tags: ['e2e', 'test', 'automation'],
            content_type: 'note',
            images: [],
        });
        createdDraftId = draft.id;
        console.log(`Created test draft #${createdDraftId}`);

        // ===== 1. 登录前端 =====
        await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded' });
        await sleep(1500);
        await page.fill('input[name="username"], input[type="text"]', 'admin');
        await page.fill('input[type="password"]', ';Ab@123456');
        await page.click('button[type="submit"]');
        await sleep(3000);
        record('登录并进入首页', page.url() === `${FRONTEND}/`, `当前URL: ${page.url()}`);
        await screenshot(page, '01-home');

        // ===== 2. 智能创作：表单提交产生任务 =====
        await page.goto(`${FRONTEND}/generate`, { waitUntil: 'domcontentloaded' });
        await sleep(800);

        const topicInput = await page.$('input[type="text"]');
        if (topicInput) {
            await topicInput.fill('自动化测试主题');
        }
        await page.click('button[type="submit"]');
        await sleep(1500);

        // 验证出现了 PENDING 状态或任务提示
        const pendingText = await page.$eval('body', el => el.textContent).catch(() => '');
        const hasTask = pendingText.includes('创作中') || pendingText.includes('PENDING') || pendingText.includes('任务已提交');
        record('智能创作-提交生成任务', hasTask);
        await screenshot(page, '02-generate-task-created');

        // ===== 3. 草稿箱：搜索与筛选 =====
        await page.goto(`${FRONTEND}/drafts`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        await screenshot(page, '03-drafts-list');

        const draftTitleVisible = await page.$(`text=E2E 测试草稿`) !== null;
        record('草稿箱-预置草稿可见', draftTitleVisible);

        // 搜索功能
        const searchInput = await page.$('input[type="text"]');
        if (searchInput) {
            await searchInput.fill('自动化验证');
            await sleep(800);
            const searchResultVisible = await page.$(`text=E2E 测试草稿`) !== null;
            record('草稿箱-搜索过滤正常', searchResultVisible, '搜索“自动化验证”');
            await screenshot(page, '03-drafts-search');

            // 清除搜索
            await searchInput.fill('');
            await sleep(500);
        }

        // 类型筛选：图文笔记应显示测试草稿，深度长文应不显示测试草稿
        const noteTab = await page.$('text=图文笔记');
        if (noteTab) {
            await noteTab.click();
            await sleep(800);
            const noteFilterShowsDraft = await page.$(`text=E2E 测试草稿`) !== null;
            record('草稿箱-图文笔记筛选正常', noteFilterShowsDraft);
        }

        const articleTab = await page.$('text=深度长文');
        if (articleTab) {
            await articleTab.click();
            await sleep(800);
            const articleFilterHidesDraft = await page.$(`text=E2E 测试草稿`) === null;
            record('草稿箱-深度长文筛选正常', articleFilterHidesDraft);
            await screenshot(page, '03-drafts-filter');

            // 切回全部
            const allTab = await page.$('text=全部');
            if (allTab) await allTab.click();
            await sleep(500);
        }

        // ===== 4. 定时发布弹窗 =====
        const scheduleBtn = await page.$('text=定时');
        if (scheduleBtn) {
            await scheduleBtn.click();
            await sleep(800);
            await screenshot(page, '04-schedule-modal');

            // 快捷选择明天 9:00
            const quickBtn = await page.$('text=明天 9:00');
            if (quickBtn) {
                await quickBtn.click();
                await sleep(500);
                const dateInput = await page.$('input[type="datetime-local"]');
                const dateValue = dateInput ? await dateInput.inputValue() : '';
                record('草稿箱-定时弹窗快捷选择', dateValue.length > 0, `时间: ${dateValue}`);
                await screenshot(page, '04-schedule-quick-select');
            }

            // 关闭弹窗，不真正触发发布
            const cancelBtn = await page.$('button:has-text("取消")');
            if (cancelBtn) await cancelBtn.click();
        } else {
            record('草稿箱-未找到定时按钮', false);
        }

        // ===== 5. 发布确认弹窗 =====
        // 点击测试草稿卡片上的发布按钮
        try {
            await page.locator('button:has-text("发布")').first().click();
            await page.waitForSelector('text=确认发布', { timeout: 3000 });
            record('草稿箱-发布确认弹窗', true);

            // 关闭弹窗，不真正触发 RPA 发布
            await page.locator('button:has-text("取消")').first().click();
        } catch (_e) {
            record('草稿箱-发布确认弹窗', false);
        }
        await screenshot(page, '05-publish-confirm');

        // ===== 汇总 =====
        console.log('\n=== 业务闭环验证汇总 ===');
        const okCount = results.filter(r => r.ok).length;
        console.log(`通过: ${okCount}/${results.length}`);
        if (globalErrors.length > 0) {
            console.log('\n全局控制台错误:');
            globalErrors.slice(0, 10).forEach(e => console.log('  -', e));
        }
        const failed = results.filter(r => !r.ok);
        if (failed.length > 0) {
            console.log('\n未通过项:');
            failed.forEach(r => console.log(`  ❌ ${r.name} — ${r.detail}`));
        }

    } catch (e) {
        console.error('业务流测试异常:', e.message);
        await screenshot(page, '99-error');
    } finally {
        // 清理测试草稿
        if (token && createdDraftId) {
            try {
                await apiDeleteDraft(token, createdDraftId);
                console.log(`Cleaned up test draft #${createdDraftId}`);
            } catch (cleanupErr) {
                console.error('Cleanup failed:', cleanupErr.message);
            }
        }
        await browser.close();
    }
})();
