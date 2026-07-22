<div align="center">

# 🐜 小红蚁 (Little Red Ant)

**AI 驱动的智能小红书运营助手** — 内容创作 · 自动发布 · 数据分析 · 竞品监控

[![CI](https://github.com/magicCzc/Little-Red-Ant/actions/workflows/ci.yml/badge.svg)](https://github.com/magicCzc/Little-Red-Ant/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/magicCzc/Little-Red-Ant/pulls)

</div>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🤖 **AI 智能创作** | 输入主题,AI 自动生成小红书文案,支持 8 种风格、多版本对比 |
| 🎨 **AI 配图** | 基于阿里云万相模型,支持文生图、图生图、AI 编辑 |
| 🚀 **一键发布** | RPA 自动操作浏览器,填写文案、上传图片、点击发布,支持定时发布 |
| 📊 **数据看板** | 阅读量、点赞、评论、收藏趋势分析,支持 7/30 天对比 |
| 👥 **矩阵账号** | 管理多个小红书账号,每个账号独立人设、独立 Cookie |
| 🎯 **竞品监控** | 自动追踪对标账号,AI 分析爆款逻辑,生成模仿建议 |
| 💬 **互动中心** | 评论全量同步,AI 智能回复建议,自动回复 |
| 🔥 **热点追踪** | 聚合微博、百度热搜,辅助选题 |
| 📝 **视频工程** | 视频脚本生成、分镜管理、自动合成 |
| 📋 **任务中心** | 异步任务队列,SSE 实时进度推送 |

---

## 🚀 快速开始

### 前置要求

- **Node.js** >= 18
- **npm** >= 9

### 安装运行

```bash
# 克隆仓库
git clone https://github.com/magicCzc/Little-Red-Ant.git
cd Little-Red-Ant

# 安装依赖
npm install

# 启动开发服务器(前后端同时启动)
npm run dev
```

打开浏览器访问 **http://localhost:5173** → 注册 → 开始使用。

### 一键启动(Windows)

双击 `start.bat` 即可自动完成安装依赖和启动服务。

---

## ⚙️ 配置

### AI API Key (必填)

首次使用需要在设置页面配置 AI API Key:

1. **阿里云通义千问** — 申请 [DashScope API Key](https://dashscope.aliyun.com/)
2. **DeepSeek** (可选) — 申请 [DeepSeek API Key](https://platform.deepseek.com/)

### 环境变量

复制 `.env.example` 为 `.env`:

```bash
cp .env.example .env
```

| 变量 | 说明 | 必填 |
|------|------|------|
| `ALIYUN_API_KEY` | 阿里云 DashScope API Key | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 否 |
| `JWT_SECRET` | JWT 签名密钥,生产环境必须修改 | 推荐 |
| `COOKIE_ENCRYPTION_KEY` | Cookie 加密密钥,与 JWT_SECRET 独立 | 推荐 |

---

## 📦 技术栈

| 前端 | 后端 | 数据库 | 自动化 |
|------|------|--------|--------|
| React 18 + TypeScript | Node.js 20 + Express | SQLite (better-sqlite3) | Playwright |
| Vite 6 | Drizzle ORM | WAL 模式 | puppeteer-extra-stealth |
| Tailwind CSS | JWT 认证 | 21 个 Repository | Circuit Breaker |
| Recharts | Zod 4 校验 | 10 个索引 | 双引擎驱动 |
| Zustand | SSE 推送 | 文件存储 | 熔断器降级 |

---

## 🏗️ 项目结构

```
xiaohongyi/
├── api/                    # 后端
│   ├── routes/             # 23 个 API 路由
│   ├── services/           # 84 个服务
│   │   ├── ai/             # AI 服务 (ContentService, ImageService)
│   │   ├── rpa/            # RPA 自动化 (Playwright)
│   │   ├── core/           # 核心业务
│   │   └── tasks/          # 任务处理器 (12 个 Handler)
│   ├── middleware/          # 中间件 (auth, validation, errorHandler)
│   ├── db/                 # Drizzle ORM (schema, client, repositories)
│   └── worker.ts           # 后台任务消费者
├── src/                    # 前端
│   ├── pages/              # 23 个页面
│   ├── components/         # 20+ 组件
│   ├── hooks/              # 自定义 Hooks
│   └── store/              # Zustand 状态管理
├── tests/                  # 44 个测试
│   ├── unit/               # 后端单元测试
│   ├── frontend/           # 前端单元测试
│   └── e2e/                # 端到端测试
└── AI/                     # CLI 命令行工具
```

---

## 🧪 测试

```bash
# 后端测试 (25 个)
npm test

# 前端测试 (9 个)
npm run test:frontend

# E2E 测试 (10 个)
node tests/e2e/verify.mjs

# 覆盖率报告
npm run test:coverage
```

---

## 🐳 Docker 部署

```bash
docker build -t xiaohongyi .
docker run -p 3000:3000 -v ./data:/app/data xiaohongyi
```

> **注意**: Docker 环境不支持 RPA 扫码登录,请先在本地完成账号绑定后再部署。

---

## 📝 已知问题

- **AI 创作**: DeepSeek 作为备选 Provider,网络不稳定时自动降级到 Aliyun
- **Docker**: 不支持 RPA 扫码登录,需先在本地绑定账号
- **数据分析**: 首次使用时数据为空,需等待自动同步完成

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交改动 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 📄 License

[MIT](LICENSE)

---

## ⚠️ 免责声明

本工具仅供学习和研究使用。使用者应遵守小红书平台的使用条款和相关法律法规。开发者不对因使用本工具而产生的任何问题承担责任。