# 更新日志

## 2026-07-31 (下午 - 工作流优化)

### 今日工作台 - 从数据看板到行动指引

- 新增 `api/services/core/WorkbenchService.ts`：聚合评论、数据、任务、竞品、通知等多模块数据，生成统一工作台视图
- 新建 `api/routes/workbench.ts`：`GET /api/workbench/today` 接口，返回紧急事项（按优先级排序）、数据概要、日历预览、运营建议
- 重写 `src/pages/Home.tsx`：从"缩略看板"升级为"今日工作台"，新增紧急任务卡片、发布日历预览、昨日数据摘要、运营建议卡片；保留原有图表与系统状态模块

### 标题优化 - AI 吸引力分析

- 新增 `api/services/ai/TitleOptimizer.ts`：调用 AI 对标题进行五维度吸引力分析（钩子吸引力、关键词匹配度、情绪感染力、表述清晰度、长度最优性），并生成优化变体
- 在 `api/routes/generate.ts` 新增 `POST /title-score` 端点
- 在 `src/pages/ContentGeneration.tsx` 的标题区域集成标题分析按钮，展示评分雷达、优化建议和可点击替换的标题变体

### AI 复盘 - 数据驱动行动

- 新增 `api/services/ai/AIReviewService.ts`：通过 AI 分析时段数据变化，生成亮点、问题、建议和最佳/最差笔记归因
- 在 `api/routes/analytics.ts` 新增 `POST /review` 端点

### 异常预警 - 自动检测与通知

- 新增 `api/services/core/AnomalyDetector.ts`：检测每日指标异常（标准差偏离）、爆款笔记（>3倍均值）、疑似限流笔记，自动创建系统通知
- 在 `api/routes/analytics.ts` 新增 `GET /anomalies` 端点

### 笔记诊断 - 单篇笔记多维分析

- 新增 `api/services/ai/NoteDiagnosisService.ts`：对单篇笔记进行标题、时机、标签、行动建议的多维度诊断
- 在 `api/routes/notes.ts` 新增 `POST /:id/diagnose` 端点

### 内容日历 - 从任务执行到内容规划

- 在 `api/services/core/DraftService.ts` 新增 `getScheduledDrafts()` 方法，按日期分组返回已排期草稿
- 在 `api/routes/drafts.ts` 新增 `GET /api/drafts/scheduled` 端点
- 改造 `src/pages/Tasks.tsx`：新增"内容日历"视图模式，三按钮切换（执行日历/内容日历/列表视图），展示已排期草稿与本周规划统计

### 爆款拆解闭环 - 从看到学到用

- 新增 `api/services/ai/CompetitorNoteAnalyzer.ts`：对竞品笔记进行七维度 AI 拆解（标题技巧、封面分析、结构分析、钩子手法、学习要点、关键句子、仿写选题）
- 在 `api/routes/competitor.ts` 新增 `POST /notes/:noteId/analyze` 端点
- 新增 `src/components/CompetitorNoteAnalysisModal.tsx`：展示拆解结果，支持复制关键句子和以此为模板创作
- 在 `src/pages/CompetitorDetail.tsx` 集成"AI 拆解"按钮与弹窗

### 多账号汇总看板

- 在 `api/services/core/AnalyticsService.ts` 新增 `getSummaryAll()` 和 `getHistoryAll()` 方法
- 在 `api/routes/analytics.ts` 新增 `GET /all-summary` 和 `GET /all-history` 端点

### 成长洞察

- 新增 `api/services/ai/GrowthInsightService.ts`：分析近 90 天笔记数据，按月聚合指标和标签表现，AI 生成垂直趋势、写作改进、下一步行动、技能成长四维度洞察
- 在 `api/routes/analytics.ts` 新增 `GET /growth-insight` 端点

### 跨账号分发

- 在 `api/services/core/AccountService.ts` 新增 `getAccountById()` 方法
- 在 `api/routes/publish.ts` 新增 `POST /batch` 批量发布端点，验证每个目标账号有效性后分别入队任务
- 在 `src/pages/ContentGeneration.tsx` 新增"多账号分发"模态框，支持勾选目标账号批量发布

### 素材账号隔离

- 改造 `src/pages/AssetsLibrary.tsx`：新增账号筛选下拉框，支持按账号过滤素材

### 创作一站式交互

- 在 `src/pages/ContentGeneration.tsx` 的标题分析面板中增强标题变体交互：点击变体可直接替换当前标题，选中状态高亮显示

### 项目自评

- 当前综合评分：**8.2 / 10**（从 7.9 提升）
- 本轮新增：今日工作台（聚合工作流）、标题优化（创作链路补齐）、AI 复盘与异常预警（数据驱动行动）、内容日历规划模式、爆款拆解闭环（竞品学习）、多账号汇总、成长洞察、跨账号分发
- 存量提升：工作流从"功能孤岛"向"运营助理"转型，创作链路覆盖选题→标题→文案→分析的完整闭环
- 剩余技术债务：移动端缺失（核心短板）、RPA 模块化程度不足、AI 多供应商兜底需完善、业务 Hook 测试覆盖不够、首屏性能优化

## 2026-07-31 (上午 - 工程化与架构收敛)

### 工程化

- 新增本地 CI 脚本 `scripts/ci.mjs`，串接 ESLint、TypeScript 检查、单元测试、前端测试、生产构建、生产 E2E
- 更新 GitHub Actions `.github/workflows/ci.yml`：Node 版本锁定 20.13.1，E2E 改跑生产构建，补充 Linux WebKit2GTK 依赖
- 修复 Windows 下 CI 脚本 `spawn npx ENOENT` 问题，统一使用 shell 执行 npm/npx 命令
- 修复生产 E2E 脚本 `tests/e2e/run-prod-e2e.mjs` 成功后未正确返回 0 退出码的问题
- 验证本地 CI 全链路通过：ESLint / TS / 48 单测 / 9 前端测试 / 生产构建 / 32 E2E 断言，耗时约 5 分钟
- 修复业务闭环 E2E 草稿箱相关失败项，UX 流程 25/25 + 业务闭环 7/7 全部通过
- 验证本地 CI 全链路再次通过，总耗时 6.33 分钟

### 前端架构与体验

- 新增通用列表数据 Hook `src/hooks/useListData.ts`，支持服务端/客户端分页、筛选、乐观更新、请求取消
- 迁移 `NoteManagement`、`VideoProjectList`、`AssetsLibrary` 至 useListData，减少重复样板代码
- 修复 `Drafts` 集成 useListData 导致的 E2E 失败，保持原有搜索/筛选交互与业务闭环可用性
- 修复 useListData 因 inline fetcher 引发的无限重渲染与 Hook 依赖告警

### 前后端共享 Schema

- 新建 `shared/schemas/index.ts`，集中管理前后端共用的 Zod Schema 与类型推导
- `api/schemas/index.ts` 改为 re-export，保持既有路由导入路径不变
- `tsconfig.json` 增加 `@shared/*` 路径别名并 include `shared` 目录
- 新增 Draft / Note 共享 Schema：
  - `CreateDraftSchema` / `UpdateDraftSchema` / `DraftSchema` / `Draft` 类型
  - `ListNotesQuerySchema` / `DeleteNoteBodySchema`
- 为 `POST /api/drafts`、`PUT /api/drafts/:id`、`DELETE /api/drafts/:id`、`GET /api/notes`、`DELETE /api/notes/:id` 接入统一校验中间件
- 将剩余 13 个路由全部迁移到共享 Schema 校验：
  - `assets`、`comments`、`compliance`、`config`、`niche`、`notifications`、`optimizations`、`prompts`、`settings`、`trends`、`trending_notes`、`user`、`video_projects`
- 完成 API 层统一运行时校验：所有写操作、路径参数、查询参数均通过 `validateBody` / `validateParams` / `validateQuery` 进入共享 Schema

### E2E 稳定性

- 修复 `tests/e2e/ux-flows.mjs` 任务中心断言依赖真实 RPA 失败时机的波动问题：通过 API 预置失败任务，确保“重试”按钮稳定出现
- 让 `ux-flows.mjs` 在断言失败或页面异常时返回非零退出码，使 `run-prod-e2e` 能正确识别 UX 失败
- 验证本地 CI 全链路通过：UX 25/25 + 业务闭环 7/7，总耗时 7.05 分钟

### 项目自评

- 当前综合评分：**7.9 / 10**
- 优势：核心业务闭环完整且已被 E2E 覆盖、CI/CD 与桌面端打包已落地、列表页逻辑收敛到统一 Hook、前后端接口契约通过共享 Schema 基本实现统一、E2E 稳定性提升且 CI 真正变绿、登录态/错误码/日志治理持续改善
- 主要技术债务：共享 Schema 已覆盖全部有参数接口但响应类型尚未统一、业务 Hook 与页面测试覆盖不足、RPA 模块化程度不够、外部依赖（小红书 Cookie / AI 余额）波动风险、首屏与包体积仍有优化空间
- 下一步最高优先级：RPA 登录态/校验/重试模块化、完善 AI 服务多供应商兜底、补充 hooks/pages 层测试、前端性能优化（chunk 拆分/懒加载）

## 2026-07-30

### 修复

- 修复 App JWT 过快过期问题：默认有效期延长至 30 天，新增 `/auth/refresh` 续期接口与前端静默续期
- 修复小红书 Cookie 因闲置过期问题：新增每 6 小时主动 Cookie 保鲜定时任务
- 修复分析面板指标为零问题：历史 `account_id` 为 NULL 的数据纳入统计兜底
- 修复评论同步为空问题：增强 Tab 识别、扩展 API 拦截、滚动去重、放宽 `root_note_id` 校验
- 修复选题挖掘“分析”按钮调用错误接口导致任务 ID 错误的问题
- 修复搜索新关键词时未重置分页导致结果为空的问题
- 修复竞品监控翻页丢失请求签名被风控拒绝的问题
- 修复 DeepSeek 连接测试未使用自定义 `base_url` 的问题
- 修复笔记深度分析后 `likes/comments/collects` 被 0 覆盖的问题
- 修复 E2E 冒烟测试登录密码错误的问题
- 修复选题挖掘 `topic_tags` 非数组导致页面白屏的问题
- 修复设置页、竞品添加页、智能创作页、互动中心回复按钮在未填写时禁用的问题
- 修复智能创作、视频生成、竞品添加、评论回复空表单提交时无中文提示的问题
- 修复 UX 自动化测试脚本与当前页面结构不一致的问题
- 修复前端单元测试（Login/Settings）中 axios mock 缺少 defaults/interceptors 导致套件挂掉的问题

### 优化

- 统一全站 axios 导入为 `@/lib/axios`，确保桌面端与 JWT 拦截器生效
- 统一后端日志为 `LoggerService`，清理 Worker / Queue / SettingsService 中的 `console.*`
- 清理前端 `src/pages` 与 `src/hooks` 中的 `console.*`，错误统一提示 `toast`
- 新增 `.gitattributes` 统一 LF 换行符
- 更新 MkDocs 文档站点
- 设置页、智能创作页、竞品添加页、互动中心回复改用点击后 toast 提示的校验方式，提升可交互性
- 任务中心新增失败任务重试确认弹窗，展示上次失败原因，避免误触
- 任务中心空状态增加引导入口，内容日历空 cell 支持一键跳转创作
- 扩展 `tests/e2e/ux-flows.mjs` 覆盖账号矩阵、数据看板、笔记管理等页面
- 新增 `tests/e2e/business-flows.mjs`，验证创作 → 草稿 → 定时/发布确认的业务闭环
- 新增 `tests/e2e/run-prod-e2e.mjs`，一键启动生产产物并跑通 E2E
- package.json 增加 `test:e2e`、`test:e2e:business`、`test:e2e:prod` 快捷命令
- 优化 E2E 等待策略，将 `networkidle` 统一改为 `domcontentloaded` + 显式等待，降低超时失败率
- 修复生产构建后 `api-dist/server.cjs` 因 better-sqlite3 等 native 模块与运行 Node 版本不匹配导致启动失败的问题
- 修复生产构建产物预览时 CORS 跨域被拒绝的问题，CORS 白名单新增 `localhost:4173`
- 后端构建脚本 `scripts/build-api.mjs` 新增 native 模块自动重建步骤
- 验证并打通 Windows 桌面端打包：`cargo tauri build` 成功生成 `小红蚁_1.0.0_x64-setup.exe`
- 锁定 Node 版本：新增 `.nvmrc`（20.13.1），`package.json` 增加 `engines` 字段

## 2026-07-28

### 修复

- 修复账号预览扫码窗口未扫码就返回已授权的问题（严格 DOM + Cookie AND 校验）
- 修复密码更新接口 404 问题，新增 `PUT /api/users/me/password`
- 修复 Settings 前端测试 OOM 问题
- 修复 BackendBootGate 阻塞登录页导致启动白屏的问题
- 修复桌面端 AI 面板和状态栏丢失的问题

### 优化

- 统一全站样式为语义化 Design Token
- Button、Badge 组件使用 CVA 重构
- 清理 `src` 下所有 `as any`
- 新增 MkDocs 文档站点

## 2026-07-27

### 新增

- 对标账号监控支持批量更新
- 内容创作支持复用热门笔记结构
- 草稿箱支持定时发布

### 修复

- 修复扫码窗口一闪而过的问题
- 优化主站登录态预检逻辑
