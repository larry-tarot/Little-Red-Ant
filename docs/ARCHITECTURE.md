# 小红蚁 (Little Red Ant) - 架构文档

> 最后更新: 2026-07-31
> 版本: 4.2

## 2026-07-31 本轮重构要点

本轮完成以下 4 个维度的架构演进：

### 1. 前后端共享 Zod Schema
- 新建 `shared/schemas/index.ts`，集中所有请求/参数/响应 Schema
- 后端 `api/schemas/index.ts` 改为 re-export，路由通过 `validateBody` / `validateParams` / `validateQuery` 统一接入
- 前端通过 `tsconfig` 的 `@shared/*` 路径别名复用类型
- 已迁移 15 个有参数路由（`drafts` / `notes` / `assets` / `comments` / `compliance` / `config` / `niche` / `notifications` / `optimizations` / `prompts` / `settings` / `trends` / `trending_notes` / `user` / `video_projects`）

### 2. 统一列表数据 Hook
- `src/hooks/useListData.ts` 抽象服务端/客户端分页、筛选、加载、错误处理、乐观更新、请求取消
- 已迁移 `NoteManagement` / `VideoProjectList` / `AssetsLibrary` / `Drafts`（前端用 client 模式 + 筛选函数）

### 3. CI/CD 稳定性
- 新增 `scripts/ci.mjs` 串接 ESLint / TypeScript / 单测 / 前端测试 / 生产构建 / 生产 E2E
- `ux-flows.mjs` 增加 `apiSeedFailedTask` 预置失败任务，移除对真实 RPA 失败时机的依赖
- `ux-flows.mjs` 在断言失败或页面异常时返回非零退出码
- GitHub Actions：Node 锁定 20.13.1，E2E 跑生产构建，补充 Linux WebKit2GTK 依赖

### 4. 自定义 Hooks 收敛
- `useAnalytics` / `useCompetitors` 抽取数据请求与状态逻辑
- 业务页面通过 hooks 复用，避免重复样板代码

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18, TypeScript, Vite 6, Tailwind CSS, Recharts, Zustand |
| 后端 | Node.js 20, Express 4, TypeScript, tsx |
| 数据库 | SQLite (better-sqlite3), WAL 模式, Drizzle ORM |
| 自动化 | Playwright, puppeteer-extra-stealth, ghost-cursor |
| AI | Aliyun DashScope, DeepSeek, OpenAI Audio |
| 认证 | JWT, bcrypt, RBAC (admin/editor) |
| 任务队列 | SQLite + 内存事件总线, 并发 3 |
| 桌面壳 | Tauri 2, WebView2/WKWebView/WebKitGTK, Node sidecar(@yao-pkg/pkg) |

## 核心架构决策

### 本地优先 (Local-First)
- SQLite 数据库,无需外部服务
- 文件存储,无需 OSS
- 适合个人/工作室,部署简单

### AI Provider 熔断器模式
- CompositeProvider 封装多个 AI 提供商
- CircuitBreaker 自动降级故障提供商
- DeepSeek + Aliyun 双引擎

### RPA 双引擎抽象
- IBrowserDriver 接口抽象
- PlaywrightDriver (默认)
- CamoufoxDriver (实验性)

### RPA 登录与会话管理

- 账号采用 **双 Cookie 设计**: `creator_cookies`(创作服务平台) 与 `main_site_cookies`(小红书主站)
- 登录流程由后端 Playwright 打开真实浏览器,用户扫码后通过 DOM + Cookie 双重检测确认登录态
- 登录成功后 Cookie 经 AES 加密落库,后续 RPA 任务通过 `BrowserService.getAuthenticatedPage()` 复用会话
- 所有 RPA 操作(发布、数据同步、竞品监控、评论、搜索、热点)均前置校验 `NO_ACTIVE_ACCOUNT` / `COOKIE_EXPIRED`
- 竞品监控等主站操作在导航后校验页面 URL 与 DOM,发现被重定向到登录页立即抛出 `COOKIE_EXPIRED`

### 账号密码登录可行性评估

目前小红蚁采用 **扫码登录** 获取 Playwright `storageState`(含 Cookie + localStorage),原因与后续演进建议如下:

| 方案 | 优点 | 风险 | 结论 |
|------|------|------|------|
| 扫码登录(当前) | 不存储用户明文密码;小红书官方推荐;触发风控概率低;Cookie 可复用 | 每次过期需人工扫码;桌面版需弹出浏览器窗口 | **保持为主方案** |
| 账号+密码登录 | 用户操作少;可自动续期 | 需明文/可逆存储密码,安全风险高;小红书登录页常出现滑块/短信/设备验证,自动化极不稳定;违反平台用户协议风险 | **暂不实现** |
| 短信验证码 | 无需保存密码 | 需要接码平台或手机短信读取,成本高且不稳定 | **不采用** |

**应对小红书网页版变更的核心思路**:

1. **不依赖固定 DOM 结构**: 选择器集中管理 + 数据库热更新,页面改版时可快速 patch
2. **双策略抓取**: API 拦截与 DOM 解析互补,降低单点失效影响
3. **登录态多重校验**: DOM 选择器 + Cookie 关键字 + URL 校验,即使页面结构微调也能识别登录态
4. **最小权限与沙箱**: Tauri 强沙箱、Cookie AES 加密、本地数据库,降低账号信息泄露风险
5. **健康巡检**: 每日自动验证 Cookie 有效性,过期即提示用户重新扫码,避免任务无效重试

> 结论: 在未有商业授权且平台反爬持续升级的背景下,**不建议改为账号密码登录**。应持续投入在"快速适配页面变化"和"稳定的扫码 Cookie 复用"上,而非破解登录流程。

### 反爬与页面变更应对策略

- **选择器外置化**: `api/services/rpa/config/selectors.ts` 集中管理,并支持 `rpa_selectors` 表热更新
- **双策略抓取**: API 拦截优先,DOM 解析兜底,任意策略失败可切换
- **人机行为模拟**: 随机延迟、平滑滚动、鼠标移动、ghost-cursor
- **登录态兜底检测**: 除了 DOM 选择器,还通过关键 Cookie(`web_session`/`webId` 等)判断登录态
- **页面有效性校验**: 抓取前识别登录页/404/反爬页/用户不存在页,拒绝保存垃圾数据
- **健康检查**: `checkAllAccountsHealth()` 每日巡检,自动清除过期 Cookie 并更新账号状态
- **错误码体系**: `NO_ACTIVE_ACCOUNT` / `COOKIE_EXPIRED` / `INVALID_SCRAPE_DATA` 等,前端映射为可操作的友好提示

### 混合任务队列
- 内存事件总线 + SQLite 持久化
- 优先级调度
- 指数退避重试 (3 次)
- 僵尸任务恢复

## 项目结构

```
xiaohongyi/
├── api/                    # 后端
│   ├── routes/             # 23 个 API 路由
│   ├── services/           # 84 个服务
│   │   ├── ai/             # AI 内容生成
│   │   ├── rpa/            # 浏览器自动化
│   │   ├── core/           # 核心业务
│   │   ├── tasks/          # 12 个任务处理器
│   │   └── video/          # 视频合成
│   ├── middleware/          # auth, validation, errorHandler
│   ├── db/                 # Drizzle ORM
│   └── worker.ts           # 后台任务消费者
├── src/                    # 前端
│   ├── pages/              # 23 个页面
│   ├── components/         # 20+ 组件(含 BackendBootGate / TitleBar)
│   └── hooks/              # 自定义 Hooks
├── src-tauri/              # Tauri 2 桌面壳(Rust + 资源)
│   ├── src/lib.rs          # 主进程: 启动 sidecar + 健康检查 + kill
│   ├── src/main.rs         # 入口
│   ├── tauri.conf.json     # 窗口/bundle/资源/externalBin 配置
│   ├── capabilities/       # 权限(最小权限原则)
│   ├── icons/              # 32/128/256/ico/icns
│   ├── binaries/           # 跨平台 sidecar 二进制(占位 .gitkeep)
│   └── resources/          # 运行时打包资源(api-dist + node_modules)
├── scripts/
│   ├── build-api.mjs           # esbuild → api-dist/server.mjs
│   ├── build-sidecar.mjs       # @yao-pkg/pkg → 单文件 Node 二进制
│   ├── sync-tauri-resources.mjs # 同步 api-dist + node_modules 到 src-tauri/resources/
│   └── generate-icons.mjs      # 跨平台图标套件
└── tests/                  # 44 个测试
    ├── unit/               # 后端单元测试
    ├── frontend/           # 前端单元测试
    └── e2e/                # 端到端测试
```

## Tauri 2 Sidecar 架构

桌面版用 **Tauri 2 + Node sidecar** 模式,把整个 Node 后端嵌进单文件二进制:

```
┌──────────────────────────────────────────────────────────────────┐
│ xiaohongyi.exe (Tauri 2 主进程, Rust)                             │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ WebView2 / WKWebView / WebKitGTK                              │ │
│ │   加载 tauri://localhost/(前端 dist, 内置)                     │ │
│ │   API 请求到 http://127.0.0.1:14753 (跨源, CORS 白名单)       │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ 系统托盘:                                                         │
│   ├─ 显示主窗口 / 隐藏主窗口                                      │
│   ├─ 退出 (kill sidecar + exit)                                   │
│   └─ 左键单击切换窗口显示/隐藏                                     │
│                                                                  │
│ 窗口关闭行为: hide() + prevent_close() → 最小化到托盘              │
│                                                                  │
│ Sidecar 看门狗:                                                   │
│   崩溃后自动重启, 最多 3 次, 指数退避 (2s, 4s, 6s)               │
│                                                                  │
│ setup() 闭包:                                                     │
│   1. 解析 <resource_dir>/api-dist/server.cjs                      │
│   2. spawn sidecar: xiaohongyi-backend.exe                        │
│        args: [api-dist/server.cjs]                                │
│        cwd:  <resource_dir>/api-dist                              │
│        env: XIAOHONGYI_USER_DATA=%APPDATA%/小红蚁                  │
│             PORT=14753  NODE_ENV=production                        │
│   3. 轮询 /api/health,30s 超时                                    │
│   4. emit('backend-ready' | 'backend-error' | 'backend-restarting')│
│   5. 构建系统托盘 (TrayIconBuilder)                                │
│                                                                  │
│ on_window_event(CloseRequested): window.hide() + prevent_close()  │
│ 托盘菜单"退出": kill_sidecar() + app.exit(0)                       │
│                                                                  │
│ 数据库备份 (Tauri Command):                                        │
│   backup_database → %APPDATA%/小红蚁/backups/app.db.<timestamp>   │
│   list_backups → 按时间降序列出                                    │
│   restore_backup(path) → 恢复数据库                                │
└──────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ xiaohongyi-backend.exe (Node sidecar)                             │
│   - 嵌入 api-dist/server.cjs + node_modules/                      │
│   - 嵌入 native .node 文件(better-sqlite3 等)                     │
│   - 启动 Express on 127.0.0.1:14753                                │
│   - 生产模式: serve dist/(前端) + /api/*                          │
│   - SPA fallback                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**关键设计点**:

- **同源架构**(生产模式):WebView 加载 `http://localhost:14753`,axios 走相对路径,完全同源,CORS 不参与
- **数据隔离**:所有用户数据(`data/`、`logs/`、`uploads/`、`temp/`、`public/`)统一放在 `XIAOHONGYI_USER_DATA` 下,Windows 是 `%APPDATA%/小红蚁/`
- **首次启动 .env bootstrap**:Tauri 主进程读 `resource/.env.example`,首次启动自动写入 `userData/.env`,避免 JWT_SECRET 缺失导致后端 crash
- **生命周期管理**:窗口关闭时 `child.kill()` 清理 sidecar 进程,避免僵尸

**与 Electron 旧版对比**:

| 维度 | Electron(已废弃) | Tauri 2 |
|------|------------------|---------|
| 主程序大小 | ~150MB | ~105MB |
| 内存占用 | ~250MB | ~80MB |
| 启动时间 | 3-5s | <1s |
| 安全模型 | Node 集成,弱沙箱 | Rust + 能力声明,强沙箱 |
| Bundle 工具 | electron-builder | Tauri CLI(NSIS/MSI/DMG/DEB/AppImage) |

## 安全

- 所有 API 路由 (除 /auth, /health) 需 JWT 认证
- 密码 bcrypt 加盐哈希
- Cookie AES-256-CBC 加密
- CORS 白名单
- 全部 prepared statements
- SSRF 双检查
- IDOR 防护

## 测试

当前测试矩阵: 29 后端单元测试 + 9 前端单元测试 + E2E 验证(verify/smoke/functional/playwright-self-test)。
运行方式参见 [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)。

## SSE 认证

任务进度使用 SSE(`/api/tasks/active`、 `/api/tasks/:id/events`)实时推送。
由于浏览器 `EventSource` 无法设置 `Authorization` header，JWT token 通过 URL query 参数 `token` 传递；
后端 `authenticateToken` 中间件同时支持标准 Bearer header 与 query token，兼顾 SSE 场景安全性。