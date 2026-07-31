/**
 * 桌面版 portable 分发打包脚本
 *
 * 用途:在 cargo tauri build 因网络问题无法下载 NSIS 时,
 *       把 target/release/ 里的所有运行时产物打成 portable zip,
 *       用户解压后双击 xiaohongyi.exe 即可启动(无需安装)。
 *
 * 输出:
 *   dist-desktop/xiaohongyi-portable-v<version>-<platform>.zip
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, rmSync, cpSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const RELEASE_DIR = path.join(ROOT, 'src-tauri', 'target', 'release');
const OUT_DIR = path.join(ROOT, 'dist-desktop');
const PKG = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf-8'));

const platformNames = {
  win32: 'windows-x64',
  linux: 'linux-x64',
  darwin: 'macos-x64',
  // aarch64
};
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const platformKey = `${platformNames[process.platform] || process.platform}-${arch}`;
const version = PKG.version;
const outName = `xiaohongyi-portable-v${version}-${platformKey}.zip`;
const outPath = path.join(OUT_DIR, outName);

if (!existsSync(RELEASE_DIR)) {
  console.error('❌ 找不到 src-tauri/target/release/,请先跑 npm run tauri:build');
  process.exit(1);
}

const exeName = process.platform === 'win32' ? 'xiaohongyi.exe' : 'xiaohongyi';
const sidecarName = process.platform === 'win32' ? 'xiaohongyi-backend.exe' : 'xiaohongyi-backend';

const required = [
  path.join(RELEASE_DIR, exeName),
  path.join(RELEASE_DIR, sidecarName),
  path.join(RELEASE_DIR, 'api-dist'),
  path.join(RELEASE_DIR, 'node_modules'),
  path.join(RELEASE_DIR, '.env.example'),
];

for (const f of required) {
  if (!existsSync(f)) {
    console.error(`❌ 缺少必要产物: ${path.relative(ROOT, f)}`);
    process.exit(1);
  }
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log('📦 [portable] 打包桌面版 portable zip...');
console.log(`   源目录: ${path.relative(ROOT, RELEASE_DIR)}`);
console.log(`   输出:   ${path.relative(ROOT, outPath)}`);

const exe = process.platform === 'win32' ? 'powershell' : 'zip';
if (process.platform === 'win32') {
  // 用 PowerShell 的 Compress-Archive
  // 临时创建一个子目录包含 portable 友好的结构
  const stagingDir = path.join(RELEASE_DIR, '__portable_staging__');
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  mkdirSync(stagingDir);
  // 复制运行时所需(Node cpSync 跨平台稳定)
  for (const f of [exeName, sidecarName, 'api-dist', 'node_modules', '.env.example']) {
    const src = path.join(RELEASE_DIR, f);
    const dest = path.join(stagingDir, f);
    cpSync(src, dest, { recursive: true });
  }
  // 写一个 portable 说明
  await writeFile(
    path.join(stagingDir, 'PORTABLE-README.txt'),
    [
      '小红蚁 桌面版 Portable 分发',
      '',
      '用法:双击 xiaohongyi.exe 启动',
      '',
      '数据目录:',
      process.platform === 'win32'
        ? '  C:\\Users\\<你>\\AppData\\Roaming\\小红蚁\\'
        : '  ~/.config/小红蚁/',
      '',
      '首次启动会自动从 .env.example 创建 .env(用户配置)',
      '之后请到设置页面填 AI API Key 等',
      '',
      '如果杀毒软件报警:本程序是 Tauri 2 + Node sidecar 打包,',
      '存在 2 个可执行文件 + node_modules 是正常现象。',
    ].join('\r\n'),
    'utf-8',
  );

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${outPath}' -Force"`,
    { stdio: 'inherit' },
  );
  rmSync(stagingDir, { recursive: true, force: true });
} else {
  execSync(`cd "${RELEASE_DIR}" && zip -r "${outPath}" ${exeName} ${sidecarName} api-dist node_modules .env.example`, {
    stdio: 'inherit',
  });
}

const size = (statSync(outPath).size / 1024 / 1024).toFixed(1);
console.log(`✅ [portable] ${outName} (${size}MB) 已生成`);
console.log('');
console.log('✨ 下一步:');
console.log(`   1. 验证: 解压 ${outName},双击 xiaohongyi.exe`);
console.log('   2. 分发: 上传到 GitHub Releases / 网盘 / 自建服务器');
console.log('   3. 用户体验: 解压后无需安装,直接双击运行');
