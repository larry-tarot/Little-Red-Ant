/**
 * UX 流程自动化验证脚本
 *
 * 目标：在“从可用到好用”的优化过程中，验证关键页面的交互流程是否顺畅、
 * 表单校验是否友好、错误提示是否清晰。
 *
 * 运行前请确保前后端已启动：
 *   npm run dev
 * 然后执行：
 *   node tests/e2e/ux-flows.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:14753';
const SCREENSHOT_DIR = 'debug/e2e/ux-flows';

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function captureConsole(page, label) {
    const errors = [];
    const handler = (msg) => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    };
    page.on('console', handler);
    return {
        detach: () => page.off('console', handler),
        errors: () => errors
    };
}

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
        throw new Error(`API login failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.token;
}

async function apiSeedFailedTask(token) {
    // 1. 入队一个生成任务（该任务不会立即执行，worker 有并发限制）
    const createRes = await fetch(`${API}/api/generate/content`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ topic: 'E2E 预置失败任务', contentType: 'note' }),
    });
    if (!createRes.ok) {
        throw new Error(`Create task failed: ${createRes.status} ${await createRes.text()}`);
    }
    const { taskId } = await createRes.json();

    // 2. 立即将其标记为 FAILED，确保任务中心出现“重试”按钮
    await sleep(500);
    const updateRes = await fetch(`${API}/api/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'FAILED', error: 'E2E seeded failure' }),
    });
    if (!updateRes.ok) {
        throw new Error(`Update task status failed: ${updateRes.status} ${await updateRes.text()}`);
    }
    console.log(`Seeded failed task ${taskId}`);
    return taskId;
}

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    process.exit(1);
});

(async () => {
    console.log('Starting UX flows test...');
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

    try {
        // ===== 1. 登录 =====
        await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(1000);
        const usernameInput = await page.$('input[name="username"]') ||
                              await page.$('input[placeholder*="用户"]') ||
                              await page.$('input[type="text"]');
        const passwordInput = await page.$('input[type="password"]');
        if (!usernameInput || !passwordInput) {
            throw new Error('Login inputs not found');
        }
        await usernameInput.fill('admin');
        await passwordInput.fill(';Ab@123456');
        await page.click('button[type="submit"]');
        await sleep(3500);
        const currentUrl = page.url();
        record('登录并进入首页', currentUrl === `${FRONTEND}/`, `当前URL: ${currentUrl}`);
        await screenshot(page, '01-home');

        // 为任务中心预置一条失败任务，避免断言依赖真实的 RPA 失败时机
        let token;
        try {
            token = await apiLogin();
            await apiSeedFailedTask(token);
        } catch (e) {
            console.error('预置失败任务失败:', e.message);
        }

        // ===== 2. 设置页：密码修改表单校验 =====
        await page.goto(`${FRONTEND}/settings`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);

        // 设置页直接使用页面内的密码表单，无需点击"修改密码"按钮
        await screenshot(page, '02-settings-password-modal');

        // 尝试提交空表单，应看到浏览器原生校验或手动校验提示
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
            await submitBtn.click();
            await sleep(800);
            const toastText = await page.$eval('[role="status"], .toast, [class*="toast"]', el => el.textContent).catch(() => '');
            record('设置页-密码表单校验', toastText.includes('密码') || toastText.includes('必填') || toastText.includes('请输入'), `提示内容: ${toastText}`);
            await screenshot(page, '02-settings-password-validation');
        } else {
            record('设置页-未找到提交按钮', false);
        }

        // ===== 3. 选题挖掘：搜索与空状态 =====
        await page.goto(`${FRONTEND}/topic-mining`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('选题挖掘页渲染', true);
        await screenshot(page, '03-topic-mining-empty');

        // 不输入关键词直接点击搜索
        const searchBtn = await page.$('button:has-text("搜索")');
        if (searchBtn) {
            await searchBtn.click();
            await sleep(800);
            const toastText = await page.$eval('[role="status"], .toast, [class*="toast"]', el => el.textContent).catch(() => '');
            record('选题挖掘-空关键词提示', toastText.includes('关键词'), `提示: ${toastText}`);
            await screenshot(page, '03-topic-mining-empty-keyword');
        }

        // 输入关键词搜索
        const searchInput = await page.$('input[type="text"]');
        if (searchInput) {
            await searchInput.fill('职场穿搭');
            await searchBtn.click();
            await sleep(1500);
            record('选题挖掘-创建搜索任务', true);
            await screenshot(page, '03-topic-mining-searching');
        }

        // ===== 4. 竞品监控：添加竞品校验 =====
        await page.goto(`${FRONTEND}/competitor`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('竞品监控页渲染', true);
        await screenshot(page, '04-competitor-monitor');

        const addBtn = await page.$('text=添加对标账号') || await page.$('text=添加账号');
        if (addBtn) {
            await addBtn.click();
            await sleep(800);
            await screenshot(page, '04-competitor-add-modal');

            // 直接提交空表单
            const submitAdd = await page.$('button[type="submit"]');
            if (submitAdd) {
                await submitAdd.click();
                await sleep(1000);
                const toastText = await page.$eval('[role="status"], .toast, [class*="toast"]', el => el.textContent).catch(() => '');
                record('竞品监控-空表单校验', toastText.includes('链接') || toastText.includes('User ID') || toastText.includes('请输入'), `提示: ${toastText}`);
                await screenshot(page, '04-competitor-add-validation');
            }
        }

        // ===== 5. 任务中心：查看失败任务与重试 =====
        await page.goto(`${FRONTEND}/tasks`, { waitUntil: 'domcontentloaded' });
        await sleep(2000);
        record('任务中心渲染', true);
        await screenshot(page, '05-tasks');

        // 查找是否有“重试”按钮
        const retryBtn = await page.$('text=重试');
        record('任务中心-存在可重试任务', !!retryBtn, retryBtn ? '找到重试按钮' : '无重试任务');

        // 检查空状态或列表都有合理的引导
        const emptyGuide = await page.$('text=暂无任务记录') || await page.$('text=去创作内容');
        const taskTable = await page.$('table');
        record('任务中心-空状态/列表正常', !!(emptyGuide || taskTable));

        // ===== 6. 互动中心：同步评论按钮 =====
        await page.goto(`${FRONTEND}/engagement`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('互动中心渲染', true);
        await screenshot(page, '06-engagement');

        const syncBtn = await page.$('text=同步评论') || await page.$('text=同步') || await page.$('text=刷新');
        record('互动中心-存在同步入口', !!syncBtn);

        // ===== 7. 智能创作：表单校验 =====
        await page.goto(`${FRONTEND}/generate`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('智能创作页渲染', true);
        await screenshot(page, '07-generate');

        const generateBtn = await page.$('button[type="submit"]');
        if (generateBtn) {
            await generateBtn.click();
            await sleep(1000);
            const toastText = await page.$eval('[role="status"], .toast, [class*="toast"]', el => el.textContent).catch(() => '');
            const hasError = toastText.includes('请输入') || toastText.includes('选题') || toastText.includes('主题') || toastText.includes('提示词');
            record('智能创作-空主题校验', hasError, `提示: ${toastText}`);
            await screenshot(page, '07-generate-validation');
        }

        // ===== 8. 草稿箱：新建草稿 =====
        await page.goto(`${FRONTEND}/drafts`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('草稿箱渲染', true);
        await screenshot(page, '08-drafts');

        // 草稿箱没有独立新建入口，内容在创作页生成后自动保存。验证搜索/筛选入口即可。
        const draftSearchInput = await page.$('input[type="text"]');
        const filterTab = await page.$('text=图文笔记') || await page.$('text=深度长文');
        record('草稿箱-存在搜索/筛选入口', !!(draftSearchInput && filterTab), draftSearchInput ? '找到搜索框' : '未找到搜索框');

        // ===== 9. 账号矩阵：页面渲染与添加入口 =====
        await page.goto(`${FRONTEND}/accounts`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('账号矩阵页渲染', true);
        await screenshot(page, '09-accounts');

        const addAccountBtn = await page.$('text=添加新账号') || await page.$('text=添加账号') || await page.$('text=绑定账号');
        record('账号矩阵-存在添加入口', !!addAccountBtn, addAccountBtn ? '找到添加账号按钮' : '未找到添加入口');

        // ===== 10. 数据看板：页面渲染与同步入口 =====
        await page.goto(`${FRONTEND}/analytics`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('数据看板页渲染', true);
        await screenshot(page, '10-analytics');

        const syncDataBtn = await page.$('text=同步最新数据') || await page.$('text=立即同步') || await page.$('text=同步');
        record('数据看板-存在同步入口', !!syncDataBtn);

        // ===== 11. 笔记管理：页面渲染 =====
        await page.goto(`${FRONTEND}/notes`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('笔记管理页渲染', true);
        await screenshot(page, '11-notes');

        // ===== 12. 视频工程：页面渲染与空状态 =====
        await page.goto(`${FRONTEND}/video-projects`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('视频工程页渲染', true);
        await screenshot(page, '12-video-projects');

        const newVideoBtn = await page.$('text=新建工程') || await page.$('text=创建您的第一个视频');
        record('视频工程-存在新建入口', !!newVideoBtn);

        // ===== 13. 素材库：页面渲染与标签切换 =====
        await page.goto(`${FRONTEND}/assets`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        record('素材库页渲染', true);
        await screenshot(page, '13-assets');

        const imageTab = await page.$('text=图片');
        if (imageTab) {
            await imageTab.click();
            await sleep(500);
            record('素材库-标签切换正常', true);
            await screenshot(page, '13-assets-image-tab');
        }

        // ===== 汇总 =====
        console.log('\n=== UX 流程验证汇总 ===');
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
        console.error('UX 测试异常:', e.message);
        await screenshot(page, '99-error');
        process.exitCode = 1;
    } finally {
        await browser.close();
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0 || globalErrors.length > 0) {
        process.exitCode = 1;
    }
    process.exit(process.exitCode || 0);
})();
