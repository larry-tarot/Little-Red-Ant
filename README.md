# 🐜 小红蚁 (Little Red Ant) — AI 小红书运营助手

一键生成爆款笔记、自动发布、数据分析、竞品监控。**免费开源，开箱即用。**

---

## 🚀 30 秒快速开始

```bash
# 方式一:一键启动(推荐)
双击 start.bat   # Windows 用户直接双击运行

# 方式二:命令行启动
git clone https://github.com/czc20021009/小红蚁.git
cd 小红蚁
npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173` → 注册 → 开始使用。

---

## 📸 功能预览

| 功能 | 说明 |
|------|------|
| ✏️ **AI 智能创作** | 输入主题,AI 自动生成小红书文案,支持 8 种风格 |
| 🎨 **AI 配图** | 根据文案自动生成配图,支持图生图、文生图 |
| 🚀 **一键发布** | 自动打开浏览器,填写文案,上传图片,点击发布 |
| 📊 **数据看板** | 阅读量、点赞、评论、收藏趋势分析 |
| 👥 **矩阵账号** | 管理多个小红书账号,每人设独立人设 |
| 🎯 **竞品监控** | 自动追踪对标账号,AI 分析爆款逻辑 |
| 💬 **互动中心** | 评论管理、AI 智能回复建议 |
| 🔥 **热点追踪** | 微博/百度热搜聚合,辅助选题 |

---

## ⚙️ 配置

首次使用需要在设置页面填写 API Key:

1. **AI 生成功能必填**:申请 [阿里云通义千问](https://dashscope.aliyun.com/) API Key
2. **可选**:申请 [DeepSeek](https://platform.deepseek.com/) API Key 作为备选

---

## 🖥️ 系统要求

- **Node.js** 18+ (推荐 20)
- **Chrome 浏览器**(用于 RPA 自动发布,可自动安装)
- 支持 **Windows / macOS / Linux**

---

## 📦 技术栈

| 前端 | 后端 | 数据库 | 自动化 |
|------|------|--------|--------|
| React 18 | Node.js 20 | SQLite | Playwright |
| Vite 6 | Express | Drizzle ORM | puppeteer-extra |
| Tailwind | TypeScript | better-sqlite3 | stealth 插件 |
| Recharts | JWT 认证 | 文件存储 | Circuit Breaker |

---

## 🏗️ 项目结构

```
xiaohongyi/
├── api/          # 后端 (Express + SQLite)
│   ├── routes/   # 23 个 API 路由
│   ├── services/ # 84 个服务
│   └── db.ts     # 数据库初始化
├── src/          # 前端 (React + Vite)
│   ├── pages/    # 23 个页面
│   ├── components/ # 20+ 组件
│   └── hooks/    # 自定义 Hooks
├── tests/        # 测试 (44 个)
│   ├── unit/     # 后端单元测试
│   ├── frontend/ # 前端单元测试
│   └── e2e/      # 端到端测试
└── AI/           # CLI 命令行工具
```

---

## 🧪 测试

```bash
npm test                 # 后端测试 (25 个)
npm run test:frontend    # 前端测试 (9 个)
npm run test:coverage    # 覆盖率报告
```

---

## 🐳 Docker 部署

```bash
docker build -t xiaohongyi .
docker run -p 3000:3000 xiaohongyi
```

---

## 📄 License

MIT

---

## 🙋 常见问题

**Q: 需要编程基础吗?**
A: 不需要。双击 `start.bat` 即可启动,打开浏览器就能用。

**Q: 需要配置什么?**
A: 首次使用需要在设置页填写 API Key。不配置也能浏览大部分功能。

**Q: 支持多账号吗?**
A: 支持。可以添加多个小红书账号,每个账号独立管理。

**Q: 会封号吗?**
A: 工具内置了频控策略(每日发布上限、操作间隔、随机延迟),模拟真人操作,降低风险。