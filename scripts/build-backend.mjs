/**
 * 把 api/ 整个 ESM 源码用 esbuild 打成 api-dist/server.mjs
 * 目的:生产环境不再依赖 tsx,可直接 node api-dist/server.mjs 跑起来
 */
import { build } from 'esbuild';
import { mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'api-dist');
const OUT_FILE = path.join(OUT_DIR, 'server.mjs');

// 第三方原生模块 / 动态加载 / 大型 native 依赖,不能 bundle
// 必须留在外部,运行时由 Node 从 node_modules 加载
// esbuild 会对这些 import 留原样,不内联
const EXTERNAL = [
  // native
  'better-sqlite3',
  'sharp',
  'bcryptjs',
  // playwright 体系
  'playwright',
  'playwright-core',
  'playwright-extra',
  'puppeteer-extra-plugin-stealth',
  'ghost-cursor',
  // ffmpeg
  'ffmpeg-static',
  'fluent-ffmpeg',
  // edge-tts / tts
  'edge-tts',
  // 阿里云
  '@alicloud/pop-core',
  'ali-oss',
  // 其它可能动态 require 的
  'puppeteer',
  'axios',
  'express',
  'cors',
  'cookie-parser',
  'dotenv',
  'express-rate-limit',
  'jsonwebtoken',
  'multer',
  'node-cron',
  'openai',
  'uuid',
  'winston',
  'winston-daily-rotate-file',
  'xlsx',
  'zod',
  'cheerio',
  'html2canvas',
  'drizzle-orm',
  'date-fns',
  'clsx',
  'tailwind-merge',
  'zustand',
  'lucide-react',
  'react',
  'react-dom',
  'react-router-dom',
  'react-hot-toast',
  'recharts',
];

console.log('🔨 [build-backend] 开始打包后端...');
console.log(`   入口: api/server.ts`);
console.log(`   输出: ${path.relative(ROOT, OUT_FILE)}`);

const start = Date.now();

// 1. 清空并重建 api-dist
if (existsSync(OUT_DIR)) {
  await import('node:fs/promises').then(fs => fs.rm(OUT_DIR, { recursive: true, force: true }));
}
await mkdir(OUT_DIR, { recursive: true });

// 2. esbuild bundle
await build({
  entryPoints: [path.join(ROOT, 'api/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: OUT_FILE,
  external: EXTERNAL,
  // esbuild 重要:在 ESM 模式下,external 必须用正则 + 函数才能正确处理
  // 否则 import 'x' 会被转成 require('x') 而被 esbuild 内联
  // 我们用纯函数来强制保持 external
  // (已通过 array 传 external 即可)
  // 在 ESM 顶部注入 createRequire 兼容老代码用 require() 的场景
  banner: {
    js: [
      "import { createRequire as __cr } from 'module';",
      "const require = __cr(import.meta.url);",
    ].join('\n'),
  },
  sourcemap: false,
  minify: false, // 保留可读性,便于排错
  treeShaking: true,
  // 处理 .ts / .tsx / ESM 风格
  loader: { '.ts': 'ts', '.tsx': 'tsx', '.json': 'json' },
  // 把 ESM-only 包(axios、express、winston 等)自动转 CJS 兼容性保持
  mainFields: ['module', 'main'],
  conditions: ['node', 'import', 'default'],
  // 不解析的 node_modules 范围(esbuild 会从 node_modules 找)
  nodePaths: [path.join(ROOT, 'node_modules')],
  // 警告抑制
  logLevel: 'warning',
  // metafile 便于诊断
  metafile: true,
});

const elapsed = Date.now() - start;
console.log(`✅ [build-backend] esbuild 完成,耗时 ${elapsed}ms`);

// 3. 复制 schema 文件(drizzle)
const schemaSrc = path.join(ROOT, 'api/db/schema');
if (existsSync(schemaSrc)) {
  const schemaDest = path.join(OUT_DIR, 'db/schema');
  await mkdir(path.dirname(schemaDest), { recursive: true });
  await copyDir(schemaSrc, schemaDest);
  console.log('📁 [build-backend] 复制 db/schema/');
}

// 4. 复制其它 .sql / .json 资源
const resourceFiles = [
  ['api/db/migrations', 'db/migrations'],
];
for (const [src, dest] of resourceFiles) {
  const srcPath = path.join(ROOT, src);
  if (existsSync(srcPath)) {
    const destPath = path.join(OUT_DIR, dest);
    await copyDir(srcPath, destPath);
    console.log(`📁 [build-backend] 复制 ${src} -> ${dest}`);
  }
}

// 5. 注入 package.json 让 ESM 解析正常工作
await import('node:fs/promises').then(async fs => {
  await fs.writeFile(
    path.join(OUT_DIR, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
    'utf-8'
  );
  console.log('📝 [build-backend] 写入 api-dist/package.json (type=module)');
});

console.log('');
console.log('✨ [build-backend] 完成。运行方式:');
console.log('   node api-dist/server.mjs');
console.log('');

/**
 * 递归复制目录
 */
async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stats = await stat(srcPath);
    if (stats.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}
