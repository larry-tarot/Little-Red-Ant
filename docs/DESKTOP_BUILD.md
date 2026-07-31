# 小红蚁桌面版(Tauri 2)构建指南

> 最后更新: 2026-07-31

本文档面向**贡献者**,介绍如何在本地或 CI 打包小红蚁桌面版。

## 概览

桌面版用 **Tauri 2** + **Node sidecar** 模式:

```
xiaohongyi.exe (Rust 主进程)
  └─ 启动 xiaohongyi-backend-<TRIPLE>.exe (Node sidecar, ~66 MB)
        └─ Express on 127.0.0.1:14753
              ├─ /api/*     (业务 API)
              └─ /*         (serve dist/, SPA fallback)
```

WebView 加载 `http://localhost:14753`,与后端完全同源(生产模式)。

## 2026-07-31 本轮更新

- sidecar 二进制大小从 ~82 MB 缩减到 ~66 MB(同步 2026-07 依赖裁剪)
- Node 版本锁定 20.13.1(与 `.nvmrc` 对齐),本地与 CI 统一
- `.github/workflows/ci.yml` 的 `desktop-build` job 已补齐 Linux `libwebkit2gtk-4.1-dev` 等系统依赖

## 前置依赖

### 通用

- **Node.js** >= 20
- **Rust** >= 1.77(`rustup install stable`)
- **npm** >= 9

### Windows

- **WebView2 Runtime**(Win11 预装,Win10 大多已有;若缺失,首次启动会下载)
- **Visual Studio Build Tools 2022** with C++ workload
- **NSIS**(由 Tauri CLI 自动下载,无需手装)
- 目标三元组:`x86_64-pc-windows-msvc`

### macOS

- **Xcode Command Line Tools**(`xcode-select --install`)
- 目标三元组:`aarch64-apple-darwin` / `x86_64-apple-darwin`

### Linux(Ubuntu 22.04+)

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  file \
  wget
```

目标三元组:`x86_64-unknown-linux-gnu`

## 本地构建

### 开发模式(快速迭代)

```bash
npm install
npm run tauri:dev
```

- 自动跑 `sync-tauri-resources.mjs` 同步资源
- 启 `npm run dev`(Vite + Express)
- 启 Cargo debug build + Webview
- 改前端代码 → Vite HMR
- 改 Rust 代码 → Cargo 自动重编

### 生产打包

```bash
npm run tauri:build
```

**完整流程**:
1. `build:frontend` — `vite build` → `dist/` (前端产物)
2. `build:api` — `esbuild` → `api-dist/server.cjs` + `node_modules`
3. `sync-tauri-resources.mjs` — 同步 `api-dist/` + `node_modules/` 到 `src-tauri/resources/`
4. `build:sidecar` — `@yao-pkg/pkg` → `binaries/xiaohongyi-backend-<TRIPLE>.exe`
5. `cargo tauri build` — 编译 Rust + 打包资源 + 生成 NSIS 安装包

> **注意**: `beforeBuildCommand` 只运行 `sync-tauri-resources.mjs` (不再重复构建),
> 避免 SHA256 校验失败和资源竞态问题。

**产物位置**:

| 平台 | 路径 |
|------|------|
| Windows | `src-tauri/target/release/bundle/nsis/小红蚁_1.0.0_x64-setup.exe` |
| Windows | `src-tauri/target/release/bundle/msi/小红蚁_1.0.0_x64_en-US.msi` |
| macOS | `src-tauri/target/release/bundle/dmg/小红蚁_1.0.0_<arch>.dmg` |
| macOS | `src-tauri/target/release/bundle/macos/小红蚁.app` |
| Linux | `src-tauri/target/release/bundle/deb/小红蚁_1.0.0_amd64.deb` |
| Linux | `src-tauri/target/release/bundle/appimage/小红蚁_1.0.0_amd64.AppImage` |

## 跨平台构建

Tauri 2 不支持交叉编译 — 必须在每个目标平台本地或 CI runner 上跑 `tauri:build`。

**GitHub Actions 已配置**三平台矩阵(`.github/workflows/ci.yml` 的 `desktop-build` job):
- `ubuntu-latest` → `.deb` / `.AppImage`
- `windows-latest` → `.exe`(NSIS)
- `macos-latest` → `.dmg` / `.app`

push 到 main 后,artifacts 会出现在 GitHub Actions 页面。

## 数据目录

桌面版所有用户数据隔离在系统用户目录下:

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\小红蚁\`(`C:\Users\<u>\AppData\Roaming\小红蚁\`) |
| macOS | `~/Library/Application Support/小红蚁/` |
| Linux | `~/.config/小红蚁/`(或 `$XDG_CONFIG_HOME/小红蚁/`) |

子目录:

```
小红蚁/
├── .env                    # 用户配置(首次启动从 .env.example bootstrap)
├── data/
│   └── app.db              # SQLite 数据库
├── logs/                   # 日志 + 截图
├── uploads/                # 用户上传的图片/视频
├── temp/                   # 临时文件
├── public/
│   ├── audio/              # TTS 生成的音频
│   └── outputs/            # 视频工程产物
└── ...
```

环境变量 `XIAOHONGYI_USER_DATA` 由 Tauri 主进程自动注入,后端读这个变量决定数据根目录。

## First-run 行为

首次启动 Tauri 桌面版,主进程会:

1. 创建用户数据目录(若不存在)
2. 读 `resource/.env.example` → 写入 `<userData>/.env`(若不存在)
3. 启动 sidecar(传入 `userData` 路径 + `PORT=14753` + `NODE_ENV=production`)
4. 轮询 `/api/health`,最多 30s
5. Webview 加载 `http://localhost:5173`(开发模式,Vite HMR) 或 `http://localhost:14753`(生产模式,Express 直出)
6. 前端 `BackendBootGate` 监听 `backend-ready` 事件,显示 spinner → 放行
7. 用户到达登录页

如果 30s 内后端没起来,前端显示友好错误 + 重启按钮。

## 常见问题

### Q: `cargo tauri build` 报 externalBin sha256 校验失败

**原因**: `beforeBuildCommand` 中重复构建了 sidecar, 导致 SHA256 变化。

**修复**: 已更新构建流水线, `beforeBuildCommand` 只运行 `sync-tauri-resources.mjs`,
构建步骤在 `tauri:build` npm script 中按正确顺序执行:
```
build:frontend → build:api → sync-tauri-resources → build:sidecar → cargo tauri build
```

### Q: EXE 打开后页面空白

**原因**: `beforeBuildCommand` 中 `sync-tauri-resources.mjs` 在 `build:api` 之前运行,
`api-dist/` 目录不存在导致资源未正确打包。`lib.rs` 中 `resolve("api-dist/server.cjs")` 失败,
`setup()` 返回 `Err` → Tauri 窗口创建失败 → 空白页。

**修复**:
1. 构建流水线顺序已修复: `sync-tauri-resources.mjs` 在 `build:api` 之后运行
2. `lib.rs` 错误处理已增强: 使用 `match` 代替 `?`, 失败时 emit `backend-error` 事件
3. 添加了文件存在性验证: 启动前检查 `api-dist/server.cjs` 是否存在

### Q: NSIS 找不到 / 下载失败

Tauri 2 会自动下载 NSIS,需联网。若被墙,可以从 [NSIS 官网](https://nsis.sourceforge.io/Download) 下载离线版放到 `target/release/nsis-*/` 下。

### Q: sidecar 启动后立刻 crash

检查 `target/release/api-dist/` 是否有 `server.mjs` 和 `node_modules/`,若没拷贝是 `sync-tauri-resources.mjs` 没跑通。

### Q: WebView 黑屏但窗口出现

- 打开 DevTools(Tauri 2 默认禁用,需要 `tauri.conf.json` 加 `"devtools": true`)
- 看 console 是不是 CORS 错误
- 看后端 log 是不是绑定端口失败

### Q: 跨平台 `.node` native 模块不兼容

`better-sqlite3` / `sharp` 的 `.node` 文件是平台特定的。**不能在 Windows 上跑 Linux 的 sidecar 二进制**,必须每个平台分别跑 `build:sidecar`。

## 安全模型

- `capabilities/default.json` 最小权限,只开 `core:window:*` 需要的几个,**不**开 `shell:allow-execute`(前端不需要)
- `tauri-plugin-shell` 仍加载(供 Rust 侧 `ShellExt` 调用),但 capability 不授权给前端 → JS 端 `import { Command }` 会失败
- WebView CSP 已配置: `default-src 'self'; connect-src 'self' http://127.0.0.1:14753; ...` 限制 API 只连本地后端
- sidecar 进程绑 `127.0.0.1`,不对外暴露

## 自动更新

桌面版已集成 `tauri-plugin-updater` 基础设施, 需要在 `tauri.conf.json` 配置更新服务器:

### 配置步骤

1. **生成密钥对**:
```bash
cargo tauri signer generate -w ~/.tauri/updater.key
```
这会生成 `~/.tauri/updater.key` (私钥) 和 `~/.tauri/updater.key.pub` (公钥).

2. **配置公钥**: 将公钥填入 `tauri.conf.json`:
```json
{
  "plugins": {
    "updater": {
      "pubkey": "your-public-key-here"
    }
  }
}
```

3. **部署更新服务器**: 在您的服务器上提供 `update.json` 文件:
```json
{
  "version": "1.0.1",
  "notes": "修复了若干问题, 优化了性能",
  "platforms": {
    "windows-x86_64": {
      "signature": "内容签名",
      "url": "https://releases.example.com/小红蚁_1.0.1_x64-setup.exe"
    }
  }
}
```

4. **在 CI 中签名**: 在 GitHub Actions 中, 用私钥对安装包进行签名, 并上传 `update.json`.

### 当前状态

- ✅ `tauri-plugin-updater` 已集成在 Cargo.toml
- ✅ `tauri.conf.json` 已配置插件端点
- ❌ 更新服务器尚未部署 (需要配置 `pubkey` 和部署 `update.json`)
- ❌ CI 签名流程尚未集成

## 调试技巧

```bash
# 1. 单独跑 sidecar 看 log
./src-tauri/binaries/xiaohongyi-backend-x86_64-pc-windows-msvc.exe \
  ./src-tauri/target/release/resources/api-dist/server.mjs

# 2. 单独跑 backend(等同 dev)
node api-dist/server.mjs

# 3. 看 Tauri 主进程 log(开 release 模式 console)
# src-tauri/src/main.rs 第一行已 #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
# 注释掉就能看到 release 模式的 console
```

## 相关文件

- `src-tauri/tauri.conf.json` — 窗口/bundle/资源/externalBin 配置
- `src-tauri/src/lib.rs` — 主进程(启动 sidecar + 健康检查 + kill)
- `src-tauri/capabilities/default.json` — 最小权限声明
- `src/lib/axios.ts` — 同源 baseURL(`__TAURI_INTERNALS__` 检测)
- `src/components/BackendBootGate.tsx` — 等后端 ready 的 splash
- `src/components/TitleBar.tsx` — 自定义窗口标题栏(min/max/close + 拖拽)
- `api/config.ts` — `XIAOHONGYI_USER_DATA` 数据目录解析
- `scripts/sync-tauri-resources.mjs` — 同步 resources/
- `scripts/build-sidecar.mjs` — @yao-pkg/pkg 打 sidecar
- `.github/workflows/ci.yml` — `desktop-build` 三平台矩阵 job
