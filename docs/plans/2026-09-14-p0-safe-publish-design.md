# P0 安全发布闭环设计

## 目标

在 Little-Red-Ant 的本地 Tauri/TypeScript 架构中实现一条受控的小红书图文发布编排链：

```text
草稿版本 → 发布前审 → 用户确认 → 账号身份校验 → 账号锁/幂等 → 发布适配器 → 三态结果回读
```

该切片只处理现有草稿的发布编排。不增加自动互动、批量养号、签名逆向、验证码绕过或反检测功能。

## 来源与许可证边界

- 主仓库：Little-Red-Ant（MIT）。
- 行为参考：DeliciousBuding/xiaohongshu-skill（Apache-2.0）中的三态发布和验证码停止语义；移植前逐文件保留 NOTICE 与第三方声明。
- 行为参考：humanized-social-publisher（MIT）中的账号隔离、身份提示、锁、预检与幂等语义。
- 行为参考：yuwen-publish-precheck（MIT）中的“发布前审不保证平台通过”的产品边界。
- 第一切片不复制第三方自动化实现；先建立本仓库的独立 TypeScript 领域模型与可替换适配器接口。

## 架构

### 新模块

`api/services/publish/`

- `types.ts`：发布请求、审查结果、状态、适配器接口。
- `SafePublishOrchestrator.ts`：唯一编排入口。
- `InMemoryAccountLock.ts`：每个账号单进程互斥锁；后续换为数据库/文件锁。
- `InMemoryIdempotencyStore.ts`：以 `accountId + draftVersionId + contentHash` 去重；后续换为 SQLite。
- `SafePublishPreflight.ts`：纯本地、确定性预审；拦截空标题、空正文、无媒体、风险词和无人工确认。
- `PublishAdapter.ts`：适配器端口。P0 使用测试双（fake adapter），不触发真实浏览器和账号写入。

### 结果状态

- `confirmed`：适配器取得平台明确成功证据。
- `submitted_unconfirmed`：执行过提交但没有可验证成功证据；绝不自动重试。
- `captcha_blocked`：检测到验证码/安全验证；挂起，交给用户。
- `failed`：未提交或有明确错误。
- `blocked`：本地预审、未确认、锁冲突或重复请求阻止执行。

## 数据流与不变量

1. `confirmedByUser` 不是可选项；未明确确认，适配器不能被调用。
2. 所有正文、标题和媒体校验在账号锁之前完成，以减少锁占用。
3. 确认后，编排器检查幂等记录；相同已确认或未知提交请求返回原始记录，不再触发适配器。
4. 同一账号同时请求时，后一个请求返回 `blocked` / `account_busy`。
5. `submitted_unconfirmed` 与 `captcha_blocked` 都写入幂等记录，禁止盲目重新提交。
6. P0 的风险词规则仅用于示例预检；生产应由版本化规则集和人工审核补充。

## HTTP 接入

P0 先只提供服务层与测试；不直接修改现有发布路由，也不碰真实 RPA。下一切片把编排器注入 `api/routes/publish.ts`，提供预览、确认和结果查询端点。

## 测试

使用 Vitest，按 TDD 实施：

1. 未确认时阻止适配器。
2. 本地预审风险时阻止适配器。
3. 同一请求幂等，适配器仅调用一次。
4. 同账号锁冲突阻止第二次提交。
5. `submitted_unconfirmed` 与 `captcha_blocked` 可返回但不可自动重试。
6. 明确成功返回 `confirmed`。

所有测试使用 fake adapter，不会启动浏览器或访问小红书。
