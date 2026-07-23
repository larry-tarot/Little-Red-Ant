/**
 * 把后端(api-dist/ + node_modules/)用 @yao-pkg/pkg 打成单文件 Node 二进制
 *
 * 输出:
 *   src-tauri/binaries/xiaohongyi-backend-x86_64-pc-windows-msvc.exe
 *   src-tauri/binaries/xiaohongyi-backend-x86_64-unknown-linux-gnu
 *   src-tauri/binaries/xiaohongyi-backend-aarch64-apple-darwin
 *   src-tauri/binaries/xiaohongyi-backend-x86_64-apple-darwin
 *
 * 关键设计:
 * 1. pkg 会把所有 .js/.mjs 源码 + node_modules 嵌进二进制
 * 2. native 模块(better-sqlite3 / sharp)需要 .node 文件 -- pkg 5.16+ 支持通过 --assets 嵌入
 * 3. 失败时降级:输出 .bin 文件,告诉用户装 Node
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const API_DIST = path.join(ROOT, 'api-dist');
const OUT_DIR = path.join(ROOT, 'src-tauri', 'binaries');

console.log('🔨 [build-sidecar] 开始打包后端 sidecar...');
console.log(`   api-dist: ${path.relative(ROOT, API_DIST)}`);
console.log(`   输出目录: ${path.relative(ROOT, OUT_DIR)}`);

// 1. 前置检查
if (!existsSync(API_DIST) || !existsSync(path.join(API_DIST, 'server.mjs'))) {
  console.error('❌ [build-sidecar] 找不到 api-dist/server.mjs');
  console.error('   请先跑: npm run build:api');
  process.exit(1);
}

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

// 2. 目标平台
const targets = {
  win32: { pkgTarget: 'node20-win-x64', binaryName: 'xiaohongyi-backend-x86_64-pc-windows-msvc.exe' },
  linux: { pkgTarget: 'node20-linux-x64', binaryName: 'xiaohongyi-backend-x86_64-unknown-linux-gnu' },
  darwin: { pkgTarget: 'node20-macos-x64', binaryName: 'xiaohongyi-backend-x86_64-apple-darwin' },
};

const currentPlatform = process.platform;
const target = targets[currentPlatform];

if (!target) {
  console.error(`❌ [build-sidecar] 不支持的平台: ${currentPlatform}`);
  process.exit(1);
}

const outputPath = path.join(OUT_DIR, target.binaryName);
const start = Date.now();

// 3. 跑 @yao-pkg/pkg
// 注意:
//  - --public 让源码以 plain JS 形式打包(不解 bytecode),便于调试
//  - --assets 把 .node 文件打进二进制
//  - --targets 指定 Node 版本 + 平台
//  - yao-pkg/pkg 5.16 之前的版本不支持 ESM,5.16+ 支持
try {
  // 先看 yao-pkg 装了没
  let pkgBin = null;
  try {
    pkgBin = execSync('npx --no-install @yao-pkg/pkg --version', { cwd: ROOT, stdio: 'pipe' }).toString().trim();
  } catch {
    // 没装,临时装
    console.log('📦 [build-sidecar] 安装 @yao-pkg/pkg...');
    execSync('npm install --no-save @yao-pkg/pkg@6.21.0', { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(`📦 [build-sidecar] 打包: ${target.pkgTarget}`);

  execSync(
    [
      'npx',
      '--no-install',
      '@yao-pkg/pkg',
      '--targets', target.pkgTarget,
      '--output', outputPath,
      '--public',
      '--compress', 'GZip',
      // 重要:把 .node 文件和必要数据文件嵌入
      // pkg 默认不抓 .node,需要 --assets 列出
      '--assets', path.join(API_DIST, '**/*'),
      '--',
      path.join(API_DIST, 'server.mjs'),
    ].join(' '),
    {
      stdio: 'inherit',
      cwd: ROOT,
      env: {
        ...process.env,
        PKG_CACHE_PATH: path.join(ROOT, '.pkg-cache'),
      },
    }
  );

  const elapsed = Date.now() - start;
  if (!existsSync(outputPath)) {
    throw new Error('pkg 没产出二进制');
  }
  const size = statSync(outputPath).size;
  console.log(`✅ [build-sidecar] ${target.binaryName} 完成 (${(size / 1024 / 1024).toFixed(1)}MB, ${elapsed}ms)`);
  console.log('');
  console.log('✨ [build-sidecar] 接下来:');
  console.log('   cargo tauri build  (Tauri 打包 Setup.exe)');
  console.log('');
} catch (e) {
  console.error('❌ [build-sidecar] 打包失败:', e.message);
  console.error('');
  console.error('🔧 备选方案: 目录式 sidecar(不打包成单二进制)');
  console.error('   1. 删除 src-tauri/tauri.conf.json 里的 externalBin');
  console.error('   2. src-tauri/Cargo.toml 里 sidecar 调用改成直接 node api-dist/server.mjs');
  console.error('   3. 把 api-dist/ + node_modules/ 加进 bundle.resources');
  console.error('   4. 用户机器需要装 Node.js(>= 20)');
  console.error('');
  process.exit(1);
}
