# 小红蚁 (Little Red Ant) - 架构文档

> 最后更新: 2026-07-22
> 版本: 3.0

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
│   ├── components/         # 20+ 组件
│   └── hooks/              # 自定义 Hooks
└── tests/                  # 44 个测试
    ├── unit/               # 后端单元测试
    ├── frontend/           # 前端单元测试
    └── e2e/                # 端到端测试
```

## 安全

- 所有 API 路由 (除 /auth, /health) 需 JWT 认证
- 密码 bcrypt 加盐哈希
- Cookie AES-256-CBC 加密
- CORS 白名单
- 全部 prepared statements
- SSRF 双检查
- IDOR 防护

## 测试

44 个测试: 25 后端 + 9 前端 + 10 E2E