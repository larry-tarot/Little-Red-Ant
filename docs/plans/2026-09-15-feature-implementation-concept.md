# XHS-Chimera 功能实现构思

> 本文将产品功能目录转换为产品对象、用户路径、服务边界和实施顺序。它不是按既有仓库目录堆功能的计划；每个模块先服务用户任务，再选择实现方式。

## 1. 统一内容经营数据图谱

所有功能围绕一组互相关联的产品对象，而非独立页面：

```text
AccountProfile
  ├─ Goal / Audience / Voice / Boundaries / BrandKit / ContentPillars
  ├─ ResearchEvidence ──> ContentOpportunity
  ├─ ContentSeries ─────> ContentOpportunity
  └─ PublishedContent <─ ContentPackage ── DraftVersion
                              ├─ CardPlan / VisualAsset
                              ├─ PreflightReview
                              └─ PublishAttempt

PublishedContent
  ├─ MetricSnapshot
  ├─ FeedbackSignal (comment / question / objection / inquiry)
  └─ ResearchEvidence ──> next ContentOpportunity
```

关键原则：一篇内容从发现机会到发布后反馈始终有同一条可追溯链；用户不必在多个模块手动重新输入上下文。

## 2. 主路径设计与页面构思

### 2.1 首页：今日工作台

**用户任务**：决定今天下一步做什么。

**默认界面**：

```text
[主操作] 找选题    [主操作] 继续创作    [主操作] 看反馈

今天值得处理
- 3 个来自评论的新问题                    [查看机会]
- 草稿《...》已停留 3 天                  [继续]
- 发布任务《...》等待你确认               [审阅]
- “避坑”栏目本周尚未更新                  [找选题]
```

**实现**：`TodayBriefService` 汇总账号、机会、草稿、发布任务、反馈信号，按用户选择的当前账号和目标排序。初期只做规则排序，不伪造 AI “优先级”。

**何时展示高级能力**：用户点击“调整推荐依据”才显示栏目覆盖、目标权重、数据区间和筛选条件。

### 2.2 账号经营档案

**用户任务**：让系统理解账号，也让用户看清账号经营方向。

**信息架构**：首次采用六步轻量向导：

```text
1. 账号目标      2. 服务谁        3. 你能讲什么
4. 内容栏目      5. 表达边界      6. 可选：导入样本和视觉
```

完成后进入一页“账号经营画布”，只显示当前最有价值的摘要；卡片展开才编辑详情。

**数据模型**：

- `account_profiles`：accountId、goals、audience、voice、boundaries、updatedAt；
- `content_pillars`：profileId、name、purpose、targetAudience、cadence、status；
- `brand_kits`：profileId、colorTokens、fontPreference、coverRules、visualSubject、approvedSamples；
- `voice_samples`：profileId、content、sourceType、approved、usageNotes。

**联动**：机会卡在创建时必须选定 accountId；内容包自动读取 account profile 的语气、边界、栏目和视觉默认值。

### 2.3 需求雷达

**用户任务**：找出值得回答的真实问题。

**默认路径**：输入一个问题/关键词 → 得到不超过五个“需求机会”卡，而非原始抓取数据表。

卡片展示：

```text
用户问题：报价单有哪些容易漏掉的项目？
为什么值得看：最近 14 天的 18 条评论反复出现此问题
适合你：匹配“装修避坑”栏目；你的账号已有预算清单经验
建议动作：写一篇收藏型清单
[看依据] [做成内容] [暂存]
```

**高级路径**：展开证据浏览器，查看原始笔记/评论、时间、来源、搜索条件、排除条件、重复聚类和竞品覆盖。

**服务拆分**：

- `EvidenceIngestionAdapter`：接入浏览器读取、手动粘贴链接、导入 CSV、后续 API；
- `EvidenceNormalizer`：标准化来源、作者、时间、内容、互动、媒体；
- `SignalExtractor`：规则+LLM 提取 question / pain / desire / objection / inquiry / misconception；
- `OpportunityService`：聚类、关联账号档案、输出机会卡；
- `EvidencePolicy`：保留来源、采集时间和使用边界，禁止“复制原文即发布”。

**MVP 实现策略**：先支持用户粘贴 1–20 条评论/笔记文本和手动链接，完整走通“证据→机会→内容”。浏览器采集适配器后接入，避免让数据抓取阻塞产品价值验证。

### 2.4 内容机会卡与选题池

**用户任务**：从“我知道一个问题”到“我值得写这篇”。

**页面**：机会卡可放入选题池。池默认按“账号匹配 + 证据强度 + 栏目空白 + 目标匹配”解释性排序。每一个分数均可点击查看理由。

**数据模型**：

- `content_opportunities`：accountId、pillarId、title、audience、scenario、problem、uniqueAngle、expectedOutcome、status、riskNotes；
- `opportunity_evidence`：opportunityId、evidenceId、role、excerpt、userApproved；
- `opportunity_series_links`：opportunityId、seriesId、relation；
- `opportunity_decisions`：accepted/deferred/rejected、reason、decidedAt。

**主要动作**：创建内容包、加入系列、标记不适合、转产品机会、设为待验证、推迟。

### 2.5 内容包与编辑器

**用户任务**：把机会做成自己的内容。

**默认编辑界面**：左侧是短的“内容意图”摘要，中心是标题与正文，右侧是三项可展开辅助：证据、视觉、风险。用户无需先学会工作流。

```text
[目标用户 / 要解决的问题 / 内容目的]

标题
正文

右侧：
- 证据：2 个需要保留或补充的事实
- 视觉：建议 6 页图文
- 发布前审：1 个需确认风险
```

**高级编辑能力**：结构视图、逐段 AI 操作、事实占位、版本 diff、跨平台派生、引用和内容模板。

**数据模型**：

- `content_packages`：opportunityId、accountId、objective、status、currentVersionId；
- `content_versions`：packageId、versionNumber、title、body、tags、factsJson、changeSummary、createdBy；
- `content_sections`：versionId、sectionType、content、sourceEvidenceIds；
- `platform_derivatives`：versionId、platform、title、body、constraints、status。

**生成机制**：生成服务只能提出候选和可编辑结构；用户的账号资料、已批准样本和证据包被明确传给模型。模型输出带 `needsUserFact`、`needsReview` 标记，不能伪造个人经历。

### 2.6 品牌视觉工坊

**用户任务**：把内容做成可读、统一、可控的图文。

**主路径**：内容包生成分页计划 → 先生成封面样图 → 用户选择/调整 → 批量生成页面 → 预览发布包。

**页面层级**：

- 默认：只显示页面缩略图、文字密度、封面短标题、一个“调整风格”按钮；
- 二级：选择品牌模板、替换素材、重做单页；
- 专业画布：图层、位置、裁切、字体、颜色、导出规格。

**数据模型**：

- `card_plans`：versionId、pageCount、storyArc、approvedSamplePageId；
- `card_pages`：planId、index、headline、bodyExcerpt、visualTask、assetId、renderStatus；
- `visual_assets`：brandKitId、type、uri、metadata、approvalStatus；
- `render_jobs`：pageId、provider、inputHash、status、resultUri、costMetadata。

**实现策略**：初期先接 HTML/CSS 卡片渲染和用户上传图片，保证文字可读与可编辑；生图 provider 作为可插拔后端，且一定先样图确认。

### 2.7 发布前审与发布包

**用户任务**：理解并确认“到底要发布什么”。

**默认页面**：

```text
账号：硬件实战笔记
版本：内容包 v3
目标：建立专业信任
媒体：6 页图文，已就绪
风险：1 项（查看）

[返回修改]          [确认并提交发布]
```

**实施**：当前已有确认、幂等、锁与状态基础。补足：

- `preflight_reviews`：versionId、ruleSetVersion、findings、decision、overrideReason；
- `publish_packages`：versionId、accountId、mediaManifest、scheduledAt、reviewId、humanConfirmationAt；
- `publish_attempts` 已存在，继续承担状态、回执和幂等。

**原则**：风险提示不能把“继续发布”埋起来；忽略风险必须留下理由；定时发布只允许已经明确确认的冻结发布包，修改内容后必须重新审阅。

### 2.8 发布后复盘

**用户任务**：弄清一篇内容意味着什么，以及下一步做什么。

**默认页面**：内容详情顶部呈现一句解释：

```text
这篇内容的收藏表现高于该栏目平均值；评论中有 12 人继续询问“报价单”。
下一步建议：创建《报价单漏项》机会卡。
```

再展开数据、评论、比较和证据。

**数据模型**：

- `published_contents`：publishAttemptId、packageId、platformNoteId、url、publishedAt；
- `metric_snapshots`：publishedContentId、capturedAt、views、likes、collects、comments、shares；
- `feedback_signals`：publishedContentId、sourceCommentId、type、summary、confidence、userVerified；
- `learning_records`：scope(account/pillar/format)、statement、evidenceIds、confidence、status；
- `follow_up_links`：publishedContentId、opportunityId、reason。

**实现策略**：先允许导入/手动记录平台数据和评论，证明复盘体验；后接创作者后台采集 adapter。不能因自动采集未完善而让闭环不可用。

## 3. 发布安全与产品体验的关系

现有发布层是后台约束，不应成为用户主要页面：

- 前台只用“确认并提交”“等待处理”“需要你检查”“已确认发布”等用户语言；
- `confirmedByUser`、SQLite 幂等键、账号锁、浏览器 Profile、RPA 回执属于后台；
- 用户需要日志时可进入“任务详情”；
- CAPTCHA、安全验证、未知提交不会装成“失败重试”，而会提示用户接管。

## 4. 分阶段实施顺序

### 阶段 A：产品对象与最小主路径

目标：用户可不依赖自动采集和真实发布，完成一次有价值的内容经营循环。

1. 账号经营档案（目标、受众、栏目、边界、样本）；
2. 手动证据录入；
3. 内容机会卡；
4. 内容包与版本；
5. 简单图文分页预览；
6. 发布前审与现有受控发布；
7. 手动指标/评论回填并生成下一篇机会。

### 阶段 B：减少重复劳动

1. 需求雷达的浏览器/导入适配器；
2. 机会聚类、账号匹配和栏目覆盖；
3. 品牌视觉资产与样图确认；
4. 自动数据快照和评论信号提取；
5. 首页今日工作台。

### 阶段 C：熟练用户能力

1. 内容日历、系列和选题池；
2. 自定义模板、规则和工作流；
3. 多账号协作、审核角色和审计；
4. 跨平台派生；
5. MCP/API 与外部模型/数据源适配器。

## 5. 每项功能的准入检查

每次实施前，必须有明确答案：

1. 用户在什么时候需要它？
2. 它减少了什么具体操作或理解成本？
3. 默认路径中用户看见什么？
4. 高级能力什么时候、从哪里出现？
5. 它读取和写入哪些产品对象？
6. 哪些默认值由系统准备，哪些判断必须留给用户？
7. 如何测试成功、失败、撤销、未知状态和数据回读？
