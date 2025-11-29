---
title: Credits 与限流最佳实践
description: 基于 MkSaaS 模板的 Credits 账本设计与 AI 请求限流规范
---

## 适用范围

- Credits 领域：`src/credits/*`
- AI 功能：`src/ai/*`、`src/app/api/chat`、`generate-images`、`analyze-content`
- 计费与配额：`src/domain/plan/*`、`src/analytics/*`

## 设计目标

- Credits 为“单一计费货币”：统一计量 AI 功能消耗。
- 账本安全可追踪：每次扣费都可从 `credits` 模块追溯来源。
- 限流与 Credits 分层：速率限制保护系统，Credits 控制总额度。

## 核心原则

1. **写操作集中在 Credits 服务**
   - 所有 Credits 增减都通过 `src/credits/services` / `src/credits/data-access` 暴露的函数完成。
   - API route / UI 层只调用高层接口，如：
     - `chargeCreditsForChat({ userId, tokens })`
     - `grantSignupBonus({ userId })`

2. **幂等性与重试安全**
   - 针对可能被重试的操作（如 Stripe Webhook、内部 job）：
     - 使用幂等键（例如 `jobId`、`stripeEventId`）保证同一业务事件只扣费一次。
   - Credits ledger 中记录：
     - 业务类型（chat/image/analyze 等）。
     - 关联资源（requestId、stripeEventId）。

3. **限流优先于扣费**
   - 对 AI 接口：
     - 先做速率限制（防止滥用和突发流量）。
     - 再做 Credits 校验和扣费（防止超额度使用）。
   - 速率限制失败时：
     - 不进行任何 Credits 扣减。

4. **计价维度清晰**
   - 对 chat/text 接口：
     - 按 tokens / 消息轮数 / 调用次数中的一种计价，并在配置中集中维护。
   - 对 image/audio 等接口：
     - 按生成数量或大小计价，不与 tokens 混用。

5. **对外暴露“剩余额度”而非“真实账本结构”**
   - 给 UI / 前端暴露简化视图：
     - 可用 Credits，总额度，本周期已用。
   - 账本内部表结构、字段命名对外隐藏，只通过 query 服务提供聚合结果。

## 实践要点（结合本仓库）

1. Credits 写路径
   - 优先复用 `src/credits/services` 和 `src/credits/utils` 中的现有能力：
     - 分配 Credits（注册赠送、订阅变更、内部任务）。
     - 扣减 Credits（AI 调用、增值服务）。
   - 新增功能涉及 Credits 时，不在 API route 内直接操作数据库，而是增加新的 Credits usecase。

2. 限流与 Credits 组合
   - AI 接口（`chat` / `generate-images` / `analyze-content`）：
     - 先做限流（例如基于 userId + endpoint 的速率限制）。
     - 再计算本次调用的预计消耗，并检查用户可用 Credits。
     - 调用模型后根据实际使用（如最终 tokens）进行“补差”式扣减（若有记录）。

3. 与订阅计划联动
   - 订阅计划应定义默认额度：
     - 每周期自动发放的 Credits。
     - 单次调用的上限（如最大图像尺寸、最大 tokens）。
   - 变更计划（升级/降级）时：
     - 保持历史 Credits 账本不变。
     - 仅影响后续周期发放与限额计算。

4. 观测与告警
   - 为 Credits 相关错误定义专门错误码与日志上下文：
     - 例如 `CREDITS_INSUFFICIENT_BALANCE`。
     - 日志中包含 userId、requestId、endpoint 以便排查。
5. 回调 URL 与重定向安全
   - 支付 / Credits 相关 Server Actions 与 API（如创建结账会话、客户门户、Credits 购买等）：
     - **禁止**从请求 body 或 query 中直接接收任意外部 URL 作为 callback/redirect 参数并原样使用。
     - 如确需支持回调参数，必须先在服务端将其约束/转换为站内相对路径（或受信任 allowlist 中的路径），再通过既有 URL helper（如 `buildSafeCallbackUrl` / `getUrlWithLocaleInCallbackUrl` 等）统一构造最终跳转地址。
   - 对来自前端的“nextUrl/redirectTo”类字段：
     - 只能作为“站内路径 hint”使用，严禁允许包含协议/主机等完整外部 URL。

## 反模式（应避免）

- 在多个模块中直接写 Credits 表，导致账本不一致。
- 在限流前先扣费，导致请求失败但 Credits 已被扣除。
- Credits 与订阅计划不区分层级，所有逻辑混在一个函数里。

## Checklist

- [ ] 新的 AI 功能在调用模型前后，都能在 Credits ledger 中找到对应记录。
- [ ] 限流失败不会发生 Credits 扣减。
- [ ] 任何一次 Credits 变动都能追溯到具体业务事件（API 请求、Webhook、Job）。

## 实施进度 Checklist

- 已基本符合
  - [x] Chat / Image / Analyze 相关 usecase（`executeAiChatWithBilling`、`generateImageWithCredits`、`analyzeWebContentWithCredits`）均通过 `consumeCredits` 统一扣费，并在调用前通过 `incrementAiUsageAndCheckWithinFreeQuota` 处理免费额度。
  - [x] AI API 路由 `/api/chat`、`/api/generate-images`、`/api/analyze-content`、`/api/storage/upload` 在执行业务前均调用 `enforceRateLimit` 做速率限制。
  - [x] Credits 账本逻辑集中在 `src/credits/domain` + `src/credits/data-access` + `src/credits/services`，通过 `distribute-credits-job`、`expiry-job` 等 usecase 暴露写入口。
- 尚待调整 / 确认
  - [ ] Webhook / Job 场景（如 Stripe 订阅续费、`/api/distribute-credits`）在 Credits 层面的幂等键（如 `stripeEventId` / `jobRunId`）是否已经统一落地并在文档中说明。
  - [ ] 非 AI 领域若未来引入按 Credits 计费（如高配存储、团队协作功能），是否复用现有 Credits usecase，而不是在各自模块中直接写数据库。
  - [ ] Credits 相关错误码与日志上下文（userId、requestId、endpoint）是否在所有调用路径中完整记录，方便观察与告警。
