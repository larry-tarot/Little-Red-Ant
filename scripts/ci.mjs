/**
 * 本地 CI 脚本
 *
 * 串接项目所有关键检查与构建步骤，确保在提交/发布前一次性验证:
 * 1. ESLint
 * 2. TypeScript 类型检查
 * 3. 单元测试
 * 4. 前端组件测试
 * 5. 生产构建 (Web + API + Sidecar)
 * 6. 生产构建 E2E 测试
 *
 * 执行:
 *   node scripts/ci.mjs
 *
 * 环境要求:
 *   - Node 20.13.1 (见 .nvmrc)
 *   - Rust/Cargo (用于 Tauri 桌面端构建,可选)
 */
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const STEPS = [
    { name: 'ESLint', cmd: 'npx', args: ['eslint', 'src', 'tests/e2e/ux-flows.mjs', 'tests/e2e/business-flows.mjs', 'tests/e2e/run-prod-e2e.mjs', 'scripts/build-api.mjs', 'api/app.ts'] },
    { name: 'TypeScript Check', cmd: 'npx', args: ['tsc', '--noEmit'] },
    { name: 'Unit Tests', cmd: 'npm', args: ['run', 'test'] },
    { name: 'Frontend Tests', cmd: 'npm', args: ['run', 'test:frontend'] },
    { name: 'Production Build', cmd: 'npm', args: ['run', 'build'] },
    { name: 'Production E2E', cmd: 'node', args: ['tests/e2e/run-prod-e2e.mjs'] },
];

async function runStep(step, index) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${index + 1}/${STEPS.length}] ${step.name}`);
    console.log(`${'='.repeat(60)}`);

    return new Promise((resolve, reject) => {
        // Windows 下 npx/npm 是 .cmd 脚本,必须通过 shell 执行
        const useShell = process.platform === 'win32';
        const child = spawn(step.cmd, step.args, {
            cwd: process.cwd(),
            shell: useShell,
            stdio: 'inherit',
            env: { ...process.env, CI: 'true' },
        });

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${step.name} failed with code ${code}`));
            }
        });
    });
}

(async () => {
    console.log('🚀 启动本地 CI 全链路检查...');
    console.log(`Node: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    const start = Date.now();

    for (let i = 0; i < STEPS.length; i++) {
        try {
            await runStep(STEPS[i], i);
        } catch (e) {
            console.error(`\n❌ CI 在第 ${i + 1} 步失败: ${e.message}`);
            process.exit(1);
        }
    }

    const duration = ((Date.now() - start) / 1000 / 60).toFixed(2);
    console.log(`\n🎉 本地 CI 全部通过！耗时 ${duration} 分钟`);
})();
