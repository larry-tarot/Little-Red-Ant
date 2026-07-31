# 小红蚁使用文档

欢迎来到小红蚁文档中心。这里汇集了安装、配置、日常使用与问题排查的完整指南。

## 小红蚁是什么？

小红蚁是一款面向小红书创作者和运营团队的一站式工具，帮助你：

- **账号管理**：集中管理多个小红书账号，快速切换活跃账号。
- **内容创作**：利用 AI 生成笔记、视频脚本、封面图，并提供可视化编辑器。
- **对标监控**：添加竞品/对标账号，AI 自动拆解爆款策略和数据趋势。
- **互动管理**：同步评论、私信，提供 AI 回复建议。

## 2026-07-31 本轮亮点

- **前后端共享 Zod Schema**：所有 API 参数都通过 `shared/schemas` 统一校验，新增/修改参数只需要改一处
- **统一列表数据 Hook**：`useListData` 抽象分页/筛选/加载/乐观更新/请求取消，多个列表页已迁移
- **本地 CI 脚本**：`npm run ci` 一键跑完整检查（ESLint / TS / 单测 / 前端 / 构建 / E2E）
- **E2E 稳定化**：UX 测试通过 API 预置失败任务，不再依赖真实 RPA 失败时机
- **Node 版本锁定**：20.13.1（与 `.nvmrc` 一致），本地与 GitHub Actions 统一
- **桌面端 sidecar 瘦身**：从 ~82 MB 缩减到 ~66 MB

## 快速导航

- [安装与启动](getting-started/installation.md)
- [首次登录](getting-started/first-login.md)
- [绑定小红书账号](accounts/bind-preview.md)
- [添加对标账号](competitor/add-competitor.md)
- [常见扫码失败排查](accounts/troubleshoot-login.md)
- [常见问题](faq.md)
- [更新日志](changelog.md)

## 面向开发者

- [系统架构](ARCHITECTURE.md)
- [开发指南](DEVELOPMENT_GUIDE.md)
- [桌面端构建](DESKTOP_BUILD.md)

## 需要帮助？

如果在使用过程中遇到问题，建议先查看：

1. [常见问题](faq.md)
2. 对应功能模块的详细教程
3. [更新日志](changelog.md) 确认是否已修复
4. 如仍无法解决，请通过 GitHub Issues 反馈

!!! tip "文档截图说明"
    文档中所有截图占位符（如 `![账号矩阵](assets/screenshots/account-matrix.png)`）需要替换为真实产品截图。建议使用 1280×720 或 1920×1080 分辨率，重点标注按钮位置。
