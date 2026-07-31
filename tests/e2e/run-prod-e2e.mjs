/**
 * 生产构建 E2E 验证脚本
 *
 * 目标：在 dist/ + api-dist/ 生产产物上跑通 E2E 测试，
 * 确保构建后的包能正常服务，而不是只在开发环境通过。
 *
 * 前置条件：
 *   npm run build   (生成 dist/ 与 api-dist/)
 * 然后执行：
 *   node tests/e2e/run-prod-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const API_PORT = 14753;
const WEB_PORT = 4173;
const API_CMD = ['node', ['api-dist/server.cjs'], { cwd: process.cwd(), shell: false, env: { ...process.env, PORT: String(API_PORT) } }];
const WEB_CMD = ['npm', ['run', 'preview', '--', '--port', String(WEB_PORT)], { cwd: process.cwd(), shell: true, env: { ...process.env, PORT: String(WEB_PORT) } }];

async function waitForUrl(url, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
            if (res.ok) return;
        } catch (_e) {
            // continue
        }
        await setTimeout(500);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function runCommand(label, cmd, args, options) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { ...options, stdio: 'pipe' });
        child.stdout.on('data', data => process.stdout.write(`[${label}] ${data}`));
        child.stderr.on('data', data => process.stderr.write(`[${label}] ${data}`));
        child.on('error', err => console.error(`[${label}] spawn error:`, err.message));
        child.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                console.warn(`[${label}] exited with code ${code}`);
            }
        });
        child.unref();
        resolve(child);
    });
}

async function runTest(script) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [script], {
            cwd: process.cwd(),
            env: { ...process.env, FRONTEND_URL: `http://localhost:${WEB_PORT}` },
            stdio: 'inherit',
        });
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${script} failed with code ${code}`));
        });
    });
}

(async () => {
    let apiProc;
    let webProc;

    try {
        console.log('🚀 启动生产环境 API...');
        apiProc = await runCommand('api', ...API_CMD);
        await waitForUrl(`http://localhost:${API_PORT}/health`);
        console.log('✅ API 就绪');

        console.log('🚀 启动生产环境前端预览...');
        webProc = await runCommand('web', ...WEB_CMD);
        await waitForUrl(`http://localhost:${WEB_PORT}/login`);
        console.log('✅ 前端就绪');

        console.log('\n🧪 运行 UX 流程测试...');
        await runTest('tests/e2e/ux-flows.mjs');

        console.log('\n🧪 运行业务闭环测试...');
        await runTest('tests/e2e/business-flows.mjs');

        console.log('\n🎉 生产构建 E2E 全部通过');
        process.exit(0);
    } catch (e) {
        console.error('\n❌ 生产构建 E2E 失败:', e.message);
        process.exitCode = 1;
    } finally {
        if (apiProc) apiProc.kill();
        if (webProc) webProc.kill();
        // Windows 上 spawn 杀不掉子进程树,用 taskkill 兜底
        if (process.platform === 'win32') {
            try {
                spawn('taskkill', ['/F', '/IM', 'node.exe'], { stdio: 'ignore' });
            } catch (_e) {
                // ignore
            }
        }
    }
})();
