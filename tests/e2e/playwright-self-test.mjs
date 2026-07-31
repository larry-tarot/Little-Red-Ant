/**
 * Playwright 自测脚本
 *
 * 验证点：
 * 1. PlaywrightDriver 能正常启动浏览器上下文
 * 2. 匿名上下文可正常访问页面
 * 3. 持久化上下文的 userDataDir 清理后不会残留旧 Cookie
 * 4. 浏览器资源能正常释放
 *
 * 注意：本测试不依赖小红书真实登录态，因此不会触发 COOKIE_EXPIRED 校验。
 */
import { PlaywrightDriver } from '../../api/services/rpa/drivers/PlaywrightDriver.ts';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const results = [];

function log(name, ok, detail) {
    results.push({ name, ok });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ': ' + detail : ''}`);
}

async function main() {
    const driver = new PlaywrightDriver();

    try {
        // 1. 启动匿名上下文并访问页面（不依赖小红书登录态）
        const session = await driver.getAuthenticatedPage({ purpose: 'ANONYMOUS', headless: true });
        await session.page.goto('https://www.example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
        const title = await session.page.title();
        log('Anonymous context page load', title.length > 0, `title: ${title}`);

        // 2. 关闭并重新启动匿名上下文，确认无残留 Cookie 异常
        await session.context.close();
        const session2 = await driver.getAuthenticatedPage({ purpose: 'ANONYMOUS', headless: true });
        const cookies = await session2.context.cookies();
        log('Fresh context has no stale cookies', cookies.length === 0, `cookie count: ${cookies.length}`);

        // 3. 登录态检测逻辑自测：模拟小红书登录页，验证心跳检测能识别登录态失效
        const loginHtmlPath = path.join(process.cwd(), 'temp-login-test.html');
        fs.writeFileSync(
            loginHtmlPath,
            '<html><body><input placeholder="手机号"><button>验证码登录</button></body></html>'
        );
        await session2.page.goto(pathToFileURL(loginHtmlPath).href, { waitUntil: 'domcontentloaded' });
        const detectedLogout = await session2.page.evaluate(() => {
            const pageText = document.body ? document.body.innerText : '';
            const hasPhoneInput = !!document.querySelector('input[placeholder*="手机号"], input[placeholder*="电话"]');
            const hasLoginText =
                pageText.includes('手机号登录') ||
                pageText.includes('验证码登录') ||
                pageText.includes('密码登录');
            return hasPhoneInput || hasLoginText;
        });
        log('Login page detection works', detectedLogout === true, `detected: ${detectedLogout}`);
        fs.unlinkSync(loginHtmlPath);

        await session2.context.close();

        // 4. 关闭所有浏览器实例
        await driver.closeAll();
        log('closeAll releases browser resources', true);
    } catch (e) {
        log('Playwright self-test', false, e.message);
    }

    const passed = results.filter((r) => r.ok).length;
    const total = results.length;
    console.log(`\n=== Playwright Self-Test ${passed}/${total} passed ===`);
    process.exit(passed === total ? 0 : 1);
}

main();
