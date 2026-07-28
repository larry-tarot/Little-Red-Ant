# 开发指南

## 环境要求

- Node.js >= 18
- npm >= 9

## 快速开始

```bash
git clone https://github.com/magicCzc/Little-Red-Ant.git
cd Little-Red-Ant
npm install
npm run dev
```

访问 http://localhost:5173

## 项目命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动前后端开发服务器 |
| `npm run build` | 构建前端 |
| `npm test` | 后端测试 (29 个) |
| `npm run test:frontend` | 前端测试 (9 个) |
| `npm run lint` | ESLint 检查 |
| `npm run check` | TypeScript 类型检查 |
| `npm run ai -- say "..."` | CLI 自然语言命令 |
| `npm run tauri:dev` | 启动 Tauri 桌面开发模式(Windows/macOS/Linux) |
| `npm run tauri:build` | 打包 Tauri 桌面安装包(NSIS/.dmg/.deb/.AppImage) |
| `npm run icons` | 重新生成 Tauri 图标套件 |

## 桌面版开发

桌面版文档见 [`DESKTOP_BUILD.md`](./DESKTOP_BUILD.md),涵盖:
- 前置依赖(Rust toolchain、WebView2、Linux webkit2gtk)
- 本地三平台构建命令
- CI 矩阵(`.github/workflows/ci.yml` 的 `desktop-build` job)
- sidecar 架构、首次启动 .env bootstrap、数据目录

> 桌面版当前主分支:`desktop-v2-tauri`(从 Electron 迁移到 Tauri 2)

## 测试

```bash
# 后端测试
npm test

# 前端测试
npm run test:frontend

# TypeScript / ESLint 检查
npm run check
npm run lint

# Playwright 驱动自测 (不依赖前后端服务)
node --import tsx/esm tests/e2e/playwright-self-test.mjs

# E2E 测试 (需要先启动前后端)
node tests/e2e/verify.mjs
node tests/e2e/smoke.mjs
node tests/e2e/functional.mjs
```

## 数据库

数据文件: `data/app.db`

```bash
# 查看数据
sqlite3 data/app.db "SELECT * FROM tasks LIMIT 10;"
```

## 环境变量

复制 `.env.example` 为 `.env`:

| 变量 | 说明 | 必填 |
|------|------|------|
| `ALIYUN_API_KEY` | 阿里云 DashScope API Key | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 否 |
| `JWT_SECRET` | JWT 签名密钥,生产环境必须修改 | 推荐 |
| `COOKIE_ENCRYPTION_KEY` | Cookie 加密密钥 | 推荐 |

## 提交规范

```
feat: 新功能
fix: Bug 修复
docs: 文档更新
refactor: 重构
test: 测试
chore: 构建/工具
```

## 分支策略

| 分支 | 说明 |
|------|------|
| main | 稳定版本,Web 端 + 共用代码 |
| desktop-v2-tauri | 桌面版 (Tauri 2, 主分支) |