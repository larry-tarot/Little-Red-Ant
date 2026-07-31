# 开发指南

> 最后更新: 2026-07-31

## 环境要求

- **Node.js** = 20.13.1（项目已通过 [`.nvmrc`](../.nvmrc) 锁定，建议 `nvm use`）
- **npm** >= 9

## 快速开始

```bash
git clone https://github.com/magicCzc/Little-Red-Ant.git
cd Little-Red-Ant
nvm use            # 自动切换到 .nvmrc 指定的 Node 版本
npm install
npm run dev        # 前后端同时启动
```

访问 <http://localhost:5173>。

## 项目命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动前后端开发服务器 |
| `npm run build` | 构建前端 |
| `npm test` | 后端测试 (48 个) |
| `npm run test:frontend` | 前端测试 (9 个) |
| `npm run lint` | ESLint 检查 |
| `npm run check` | TypeScript 类型检查 |
| `npm run ai -- say "..."` | CLI 自然语言命令 |
| `npm run tauri:dev` | 启动 Tauri 桌面开发模式 (Windows / macOS / Linux) |
| `npm run tauri:build` | 打包 Tauri 桌面安装包 (NSIS / .dmg / .deb / .AppImage) |
| `npm run icons` | 重新生成 Tauri 图标套件 |
| `npm run test:e2e:prod` | 生产构建端到端测试 (UX + 业务闭环) |
| `npm run ci` | **本地 CI** (ESLint / TS / 单测 / 前端测试 / 构建 / E2E 一把跑) |

## 本地 CI 流水线

`npm run ci` 会按顺序跑：

1. **ESLint** — 静态检查
2. **TypeScript** — `tsc --noEmit`
3. **Unit Tests** — 后端 Vitest
4. **Frontend Tests** — 前端 Vitest
5. **Production Build** — esbuild + Tauri sidecar（产物 ~66 MB）
6. **Production E2E** — UX 25 项 + 业务闭环 7 项

通过标准：所有步骤 exit 0，单次耗时约 7 分钟。

## 桌面版开发

桌面版文档见 [`DESKTOP_BUILD.md`](./DESKTOP_BUILD.md)，涵盖：

- 前置依赖（Rust toolchain、WebView2、Linux webkit2gtk）
- 本地三平台构建命令
- CI 矩阵（`.github/workflows/ci.yml` 的 `desktop-build` job）
- sidecar 架构、首次启动 .env bootstrap、数据目录

> 桌面版当前主分支：`desktop-v2-tauri`（从 Electron 迁移到 Tauri 2）

## 测试

```bash
# 后端测试
npm test

# 前端测试
npm run test:frontend

# TypeScript / ESLint 检查
npm run check
npm run lint

# Playwright 驱动自测（不依赖前后端服务）
node --import tsx/esm tests/e2e/playwright-self-test.mjs

# E2E 测试（需要先启动前后端）
node tests/e2e/verify.mjs
node tests/e2e/smoke.mjs
node tests/e2e/functional.mjs
node tests/e2e/ux-flows.mjs
node tests/e2e/business-flows.mjs

# 一键跑生产构建 E2E（推荐 CI 用）
npm run test:e2e:prod
```

## 共享 Schema

`shared/schemas/index.ts` 是前后端共用的 Zod Schema 单一来源。

- 后端 `api/schemas/index.ts` 改为 `export * from '../../shared/schemas/index.js'`
- 前端通过 `tsconfig` 的 `@shared/*` 别名引入
- 新增/修改参数时统一改这一个文件即可

示例：

```ts
import { CreateDraftSchema, IdParamSchema } from '@shared/schemas';
import { validateBody, validateParams } from '../middleware/validation.js';

router.post('/', validateBody(CreateDraftSchema), handler);
router.put('/:id', validateParams(IdParamSchema), validateBody(UpdateDraftSchema), handler);
```

## 数据库

数据文件：`data/app.db`

```bash
# 查看数据
sqlite3 data/app.db "SELECT * FROM tasks LIMIT 10;"
```

## 环境变量

复制 `.env.example` 为 `.env`：

| 变量 | 说明 | 必填 |
|------|------|------|
| `ALIYUN_API_KEY` | 阿里云 DashScope API Key | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 否 |
| `JWT_SECRET` | JWT 签名密钥，生产环境必须修改 | 推荐 |
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
| main | 稳定版本，Web 端 + 共用代码 |
| desktop-v2-tauri | 桌面版（Tauri 2，主分支） |
| feat/* | 新特性 PR 分支（例：`feat/shared-schema-and-e2e-stability`） |