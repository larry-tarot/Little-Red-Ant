/**
 * Tauri 资源同步脚本
 *
 * 在 build:api 完成后,把所有 runtime 需要的 node_modules 物理复制到 src-tauri/resources/
 * 这样 Tauri 的 resources glob pattern 扫描稳定的目录,避免跟 build:api 的复制竞态
 *
 * 复制目标: src-tauri/resources/node_modules/<pkg>
 * Tauri 打包后: <resource_dir>/node_modules/<pkg>
 */
import { copyFile, readdir, stat, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const API_DIST = path.join(ROOT, 'api-dist');
const API_DIST_NM = path.join(API_DIST, 'node_modules');
const OUT_DIR = path.join(ROOT, 'src-tauri', 'resources', 'node_modules');
const OUT_API_DIST = path.join(ROOT, 'src-tauri', 'resources', 'api-dist');

// 从 build-api.mjs 同步 EXTERNAL 列表
const buildApi = await import('node:fs/promises').then(fs =>
  fs.readFile(path.join(ROOT, 'scripts', 'build-api.mjs'), 'utf-8')
);
const match = buildApi.match(/const EXTERNAL = \[([\s\S]*?)\];/);
if (!match) {
  console.error('找不到 EXTERNAL 数组');
  process.exit(1);
}
const externalList = match[1]
  .split('\n')
  .map(l => l.trim().replace(/^['"]|['"],?$/g, '').replace(/,\s*$/, ''))
  .filter(l => l && !l.startsWith('//'));

console.log(`📦 [tauri-resources] 同步 ${externalList.length} 个 EXTERNAL 包到 src-tauri/resources/node_modules/`);
await mkdir(OUT_DIR, { recursive: true });

// 同步 api-dist 源文件
// 注意:db/ 已经被 esbuild bundle 进 server.mjs,public/temp 是运行时在 userData 下的目录
console.log(`📦 [tauri-resources] 同步 api-dist/server.mjs + package.json`);
await mkdir(OUT_API_DIST, { recursive: true });
for (const f of ['server.mjs', 'package.json']) {
  const src = path.join(API_DIST, f);
  const dest = path.join(OUT_API_DIST, f);
  if (!existsSync(src)) {
    console.log(`   ⏭️  ${f} (源不存在,跳过)`);
    continue;
  }
  if (existsSync(dest)) {
    await rm(dest, { recursive: true, force: true });
  }
  await copyEntry(src, dest);
  console.log(`   📁 api-dist/${f}`);
}

for (const pkg of externalList) {
  let srcPkg;
  let destPkg;
  if (pkg.startsWith('@')) {
    // @scope/pkg
    const [scope, name] = pkg.split('/');
    srcPkg = path.join(API_DIST_NM, scope, name);
    destPkg = path.join(OUT_DIR, scope, name);
  } else {
    srcPkg = path.join(API_DIST_NM, pkg);
    destPkg = path.join(OUT_DIR, pkg);
  }

  if (!existsSync(srcPkg)) {
    console.log(`   ⏭️  ${pkg} (源不存在,跳过)`);
    continue;
  }

  // 已存在且大小差不多,跳过
  if (existsSync(destPkg)) {
    const srcStat = await stat(srcPkg);
    const destStat = await stat(destPkg);
    if (destStat.mtimeMs >= srcStat.mtimeMs) {
      console.log(`   ⏭️  ${pkg} (已同步)`);
      continue;
    }
    // 旧版本,删除
    await rm(destPkg, { recursive: true, force: true });
  }

  await copyDir(srcPkg, destPkg);
  console.log(`   📁 ${pkg}`);
}

console.log('✅ [tauri-resources] 完成');

async function copyEntry(src, dest) {
  const stats = await stat(src);
  if (stats.isDirectory()) {
    await copyDir(src, dest);
  } else if (stats.isSymbolicLink()) {
    // 跳过符号链接
    return;
  } else {
    try {
      await copyFile(src, dest);
    } catch (e) {
      // EPERM/EBUSY: 跳过被锁的文件
      if (e.code === 'EPERM' || e.code === 'EBUSY') {
        // 静默跳过
      } else {
        throw e;
      }
    }
  }
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    await copyEntry(srcPath, destPath);
  }
}
