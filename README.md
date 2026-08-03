<div align="center">

# 🐜 小红蚁 (Little Red Ant)

**AI 驱动的小红书一站式运营助手** — 内容创作 · 自动发布 · 数据分析 · 竞品监控 · 桌面端

[![CI](https://github.com/magicCzc/Little-Red-Ant/actions/workflows/ci.yml/badge.svg)](https://github.com/magicCzc/Little-Red-Ant/actions)
[![Docs](https://img.shields.io/badge/docs-mkdocs-blue)](https://magicCzc.github.io/Little-Red-Ant/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22-brightgreen)](.nvmrc)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/magicCzc/Little-Red-Ant/pulls)

</div>

---

## ✨ 这是什么？

小红蚁是一款面向小红书创作者、运营工作室的本地优先 AI 工具，覆盖**账号管理 → AI 创作 → 草稿与发布 → 互动管理 → 选题与对标 → 数据分析**完整工作流。

特色：

- 🤖 **AI 创作**：阿里云通义 / DeepSeek 双供应商熔断，文案/封面/视频脚本一键生成
- 🛰️ **RPA 自动化**：Playwright 真实浏览器，自动发布、定时发布、评论回复
- 🪟 **Tauri 2 桌面端**：单文件安装包，Windows / macOS / Linux 三平台发布
- 🛡️ **稳定可控**：统一共享 Zod schema、CI 全链路（48 单测 + 9 前端 + UX 25 + 业务 7）

📘 **完整使用文档请前往 [📚 小红蚁文档站](https://magicCzc.github.io/Little-Red-Ant/)**（MkDocs 部署）
🏗️ **系统架构**：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
🛠️ **开发指南**：[docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)
🖥️ **桌面端构建**：[docs/DESKTOP_BUILD.md](docs/DESKTOP_BUILD.md)

---

## 🗂️ 功能矩阵

| 模块 | 能力 | 状态 |
| --- | --- | --- |
| 🏠 仪表盘 | 7/30 天数据对比、核心指标卡 | ✅ |
| 🤖 智能创作 | 文案 / 封面 / 视频脚本；多风格对比；自动重试 | ✅ |
| 📝 草稿箱 | 搜索 + 筛选 + 定时发布 + 发布确认 | ✅ |
| 🚀 一键发布 | 真实浏览器 RPA + 创作服务平台发布 + 定时任务 | ✅ |
| 👥 账号矩阵 | 多账号管理 / 双 Cookie 区分 / 扫码登录 / 登录态保鲜 | ✅ |
| 🎯 选题挖掘 | 关键词搜索 + AI 拆解 + 导出 Markdown / Excel | ✅ |
| 👀 对标监控 | 自动追踪对标账号 + AI 爆款拆解 + 批量刷新 | ✅ |
| 💬 互动中心 | 评论全量同步 + AI 智能回复 + 一键回复 | ✅ |
| 📊 数据看板 | 趋势图 / Top 笔记 / 时段分布 | ✅ |
| 🔥 热点追踪 | 微博 / 百度热搜聚合 | ✅ |
| 🎬 视频工程 | 脚本分镜 + 视频合成 + BGM | ✅ |
| 📋 任务中心 | 异步任务队列 + SSE 实时进度 + 重试 | ✅ |
| 🪟 Tauri 桌面端 | Windows / macOS / Linux 三平台安装包 | ✅ |

---

## 🚀 5 分钟跑起来

### 前置要求

- **Node.js** = 20.13.1（项目已通过 [`.nvmrc`](.nvmrc) 锁定）
- **npm** >= 9
- 可选：**Rust** >= 1.77（仅桌面端构建需要）

### Web 版

```bash
git clone https://github.com/magicCzc/Little-Red-Ant.git
cd Little-Red-Ant
npm install
npm run dev      # 前后端同时启动
```

打开 <http://localhost:5173>，按提示注册 → 绑定小红书账号 → 开始使用。

> Windows 用户也可以双击 `start.bat` 一键启动。

### 配置 AI Key

进入 **设置 → AI 模型**，配置以下任一：

- **阿里云 DashScope**（[申请](https://dashscope.aliyun.com/)）— 推荐
- **DeepSeek**（[申请](https://platform.deepseek.com/)）— 备选

未配置时系统以 Demo 模式启动，可正常浏览 UI。

---

## 🪟 桌面版（Tauri 2）

跨平台安装包，分发无需 Node 环境：

```bash
npm run tauri:build
# 产物
# src-tauri/target/release/bundle/nsis/   (Windows .exe)
# src-tauri/target/release/bundle/dmg/     (macOS .dmg)
# src-tauri/target/release/bundle/deb/     (Linux .deb)
# src-tauri/target/release/bundle/appimage/(Linux .AppImage)
```

桌面版架构：

```
xiaohongyi.exe (Rust 主进程)
  └─ spawn xiaohongyi-backend.exe (Node sidecar, ~66 MB)
        └─ Express on 127.0.0.1:14753
              ├─ /api/*   业务 API
              └─ /*       dist/ 前端 (SPA fallback)
```

详细步骤见 [docs/DESKTOP_BUILD.md](docs/DESKTOP_BUILD.md)。

---

## 🧪 测试与质量

```bash
npm run lint            # ESLint
npm run check           # TypeScript --noEmit
npm test                # 后端单元测试 (48 个)
npm run test:frontend   # 前端单元测试 (9 个)
npm run build           # 生产构建（后端 esbuild + Tauri sidecar）
npm run test:e2e:prod   # 生产构建端到端 (UX 25 + 业务闭环 7)
npm run ci              # 串接以上所有步骤的本地 CI
```

| 维度 | 当前指标 |
| --- | --- |
| ESLint / TypeScript | ✅ 通过 |
| 单元测试 | 48 / 48 |
| 前端测试 | 9 / 9 |
| UX E2E | 25 / 25 |
| 业务闭环 E2E | 7 / 7 |
| 本地 CI 总耗时 | ≈ 7 分钟 |

---

## 🏗️ 架构亮点

- **前后端共享 Zod Schema**：`shared/schemas/` 单点定义，路由 `validateBody` / `validateParams` / `validateQuery` 统一接入
- **统一列表数据 Hook**：`src/hooks/useListData.ts` 抽象分页/筛选/乐观更新/请求取消，多个列表页收敛
- **AI Provider 熔断器**：`CompositeProvider` 自动在 DeepSeek / Aliyun 之间降级
- **RPA 双 Cookie**：`creator_cookies` + `main_site_cookies` 解耦，后端 `BrowserService` 统一管理会话
- **桌面端 Node sidecar**：`@yao-pkg/pkg` 打包成 66 MB 单文件，与 Rust 进程 IPC 通信

完整架构图与决策记录见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 🤝 贡献

1. Fork & 拉分支 (`git checkout -b feat/awesome`)
2. 提交 (`git commit -m 'feat: ...'`)
3. 推送 (`git push origin feat/awesome`)
4. 在 GitHub 上创建 PR，等待 CI 绿
5. 通过后由维护者 merge

> 提 PR 前请确保 `npm run ci` 在你本地通过。

---

## 📄 License

[MIT](LICENSE)

---

## ⚠️ 免责声明

本工具仅供学习与研究使用。使用者应遵守小红书平台的使用条款及相关法律法规，开发者不对因使用本工具产生的任何问题承担责任。
