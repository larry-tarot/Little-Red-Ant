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
 * 2. native 模块(better-sqlite3 / sharp)需要 .node 文件 -- pkg 6.x 通过 package.json 的
 *    pkg.assets 数组指定要嵌入的额外文件(CLI 不再支持 --assets flag)
 * 3. 失败时降级:输出 .bin 文件,告诉用户装 Node
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
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
if (!existsSync(API_DIST) || !existsSync(path.join(API_DIST, 'server.cjs'))) {
  console.error('❌ [build-sidecar] 找不到 api-dist/server.cjs');
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
    // 没装,根据 Node.js 版本选择兼容的 pkg 版本
    const nodeMajor = parseInt(process.versions.node, 10);
    const pkgVersionSpec = nodeMajor >= 22 ? '@yao-pkg/pkg@6.21.0' : '@yao-pkg/pkg@5.16.1';
    console.log(`📦 [build-sidecar] 安装 ${pkgVersionSpec} (Node ${process.versions.node})...`);
    execSync(`npm install --no-save ${pkgVersionSpec}`, { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(`📦 [build-sidecar] 打包: ${target.pkgTarget}`);

  // 检测 pkg 版本,5.x 支持 --assets CLI flag,6.x 必须用 pkg.config.mjs
  // 当前项目用 5.16.1(支持预编译 base binary,无需 MSVC)
  const pkgVersion = execSync('npx --no-install @yao-pkg/pkg --version', { cwd: ROOT, stdio: 'pipe' }).toString().trim();
  const isPkgV6Plus = pkgVersion.startsWith('6.') || pkgVersion.startsWith('7.');
  console.log(`   pkg 版本: ${pkgVersion} (${isPkgV6Plus ? '6.x,需 config 文件' : '5.x,支持 --assets'})`);

  if (isPkgV6Plus) {
    // pkg 6.x:使用 --sea 模式(利用 Node.js 的 SEA 特性,无需预编译 base binary)
    // 注意: --sea 模式要求 Node.js >= 20,且只支持单文件入口
    // server.cjs 已被 esbuild bundle 成单文件,外部依赖通过 pkg.config.mjs 的 assets 声明嵌入
    // 显式传入 --config 确保 native .node 文件被正确打包
    const pkgConfig = path.join(API_DIST, 'pkg.config.mjs');
    if (!existsSync(pkgConfig)) {
      throw new Error('找不到 pkg.config.mjs,需要配置 assets 以嵌入 native 模块');
    }
    console.log(`   pkg 版本: ${pkgVersion} (6.x+, --sea 模式, config: ${pkgConfig})`);
    execSync(
      [
        'npx', '--no-install', '@yao-pkg/pkg',
        '--sea',
        '--compress', 'GZip',
        '--config', pkgConfig,
        '--output', outputPath,
        '--',
        path.join(API_DIST, 'server.cjs'),
      ].join(' '),
      {
        stdio: 'inherit',
        cwd: ROOT,
        env: { ...process.env, PKG_CACHE_PATH: path.join(ROOT, '.pkg-cache') },
      }
    );
  } else {
    // pkg 5.x: --assets CLI flag 还能用
    // 先修补 undici 的 node:sqlite 引用(pkg 5.x 不识别这个 built-in module)
    const undiciDir = path.join(API_DIST, 'node_modules', 'cheerio', 'node_modules', 'undici');
    const undiciFilesToPatch = [
      'lib/cache/sqlite-cache-store.js',
      'lib/util/runtime-features.js',
    ];
    const undiciPatches = [];
    for (const file of undiciFilesToPatch) {
      const fp = path.join(undiciDir, file);
      if (existsSync(fp)) {
        const original = readFileSync(fp, 'utf-8');
        undiciPatches.push({ path: fp, original });
        const patched = original.replace(/require\('node:sqlite'\)/g, 'null /* patched for pkg */');
        writeFileSync(fp, patched, 'utf-8');
        console.log(`   🔧 修补 undici/${file} (node:sqlite)`);
      }
    }

    execSync(
      [
        'npx', '--no-install', '@yao-pkg/pkg',
        '--targets', target.pkgTarget,
        '--output', outputPath,
        '--public',
        '--compress', 'GZip',
        '--assets', path.join(API_DIST, '**/*'),
        '--',
        path.join(API_DIST, 'server.cjs'),
      ].join(' '),
      {
        stdio: 'inherit',
        cwd: ROOT,
        env: { ...process.env, PKG_CACHE_PATH: path.join(ROOT, '.pkg-cache') },
      }
    );
    // 恢复 undici 文件(不影响后续开发)
    for (const p of undiciPatches) {
      writeFileSync(p.path, p.original, 'utf-8');
      console.log(`   🔧 恢复 ${path.relative(API_DIST, p.path)}`);
    }
  }

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
  console.error('   2. src-tauri/Cargo.toml 里 sidecar 调用改成直接 node api-dist/server.cjs');
  console.error('   3. 把 api-dist/ + node_modules/ 加进 bundle.resources');
  console.error('   4. 用户机器需要装 Node.js(>= 20)');
  console.error('');
  process.exit(1);
}
