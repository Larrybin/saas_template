---
title: Creem Payment 集成计划（Phase A：Payment Provider + Webhook + Billing/Credits 打通）
description: 在现有 Stripe 架构下，引入 Creem 作为新的 Payment Provider，通过 /api/webhooks/creem 打通 Payment → Billing → Credits 链路，为后续 Better Auth 插件集成预留扩展点。
---

## Phase A 设计基线（REST-only：Provider + Webhook）

- 不再接入官方 SDK：`CreemClient` 仅封装 Creem HTTP REST API（如 `/v1/checkouts` 等），以官方 API 文档为唯一权威来源，不以 TS SDK 方法名/类型为约束。
- `request_id` 与 `metadata` 约定：在 `CreemPaymentProvider` 内通过统一 helper（如 `buildCreemCheckoutMetadata`）同时生成/透传 `request_id` 与业务 `metadata`，包含至少 `user_id` / `product_type`（`'subscription' | 'credits'`）/ `credits?` / `provider_id: 'creem'` / `request_id`，并在所有调用 `CreemClient.createCheckout` 时写入请求体的 `request_id` 字段。Creem 会在 checkout 创建响应以及相关 webhook 事件中回传该字段（当前主要出现在 `checkout.completed` 上，具体以官方文档为准），用于在内部系统中进行调试与对账关联。
- plan/price/package 映射入口：Phase A 在 `websiteConfig.payment.creem` 下直接配置
  `subscriptionProducts[planId][priceId] -> { productId, priceId? }`、
  `creditProducts[packageId] -> { productId, priceId? }`，
  由纯函数（例如 `resolveCreemPlanProduct` / `resolveCreemCreditsProduct`）读取，`CreemPaymentProvider` 不再内联散落映射逻辑。
- `getSubscriptions` 路径：Creem 分支与 Stripe 一致，复用 `SubscriptionQueryService + PaymentRepository`，从本地订阅/支付表读数据；Phase A 不调用 Creem 的订阅列表 API，订阅状态由 Webhook + 事件仓储写入本地后统一暴露。
- `createCustomerPortal` 能力边界：仅返回 Creem 托管入口（如 my‑orders 或后续官方 customer portal API 的封装），本系统不承载卡信息管理 UI 或直接修改支付方式的界面。
- 类型对齐：在 `src/payment/creem-types.ts` 中，让 `CreemSubscription.status` 覆盖官方状态集合（如 `active` / `past_due` / `canceled` / `trialing` / `incomplete` / `expired` 等），并在 Webhook Handler 中集中完成「Creem 状态 → 内部 `PaymentStatus`」的映射。

> 如本节与其他章节中关于 `CreemPaymentProvider` / `CreemClient` 的早期草稿描述存在冲突，以本节约定作为 Phase A Provider 侧的最终设计基线；后续 Phase B/Beyond 可在此基础上再抽象出 PlanPolicy 等更通用层。


## 0. 范围与目标

- 仅实现 **Phase A：Payment 域主干 + Creem Webhook + Billing/Credits 打通**。
- 不改动现有 Stripe 行为，不删不废弃，仅在其旁边新增 Creem 通路。
- 不改 UI / 路由对外 API 约定（`createCheckout` / `createCreditCheckout` / `createCustomerPortal` / `getSubscriptions` 保持接口不变）。
- 为未来 Phase B（Better Auth Creem 插件 hasAccess/客户端 API）预留清晰扩展点，但本阶段不接入插件。

**当前实现进度（概览）：**

- [x] `DefaultPaymentProviderFactory` 已改为懒初始化 Stripe Provider，构造函数不直接触发 env 校验。
- [x] `'creem'` 分支已默认启用并完成懒初始化：当 `websiteConfig.payment.provider = 'creem'` （默认值）时，直接返回 `CreemPaymentProvider`，具体接入 Test Mode 还是 Live Mode 由 `CREEM_API_URL` 与配套 API Key 决定。
- [x] Creem Provider / Webhook / Billing/Credits 主链路（Provider → `/api/webhooks/creem` → Billing/Credits）已完成第一版实现，并通过单元/组合测试验证；本文件其余章节中的细节项与 TODO 继续作为后续打磨清单使用。

---

## 1. 环境变量与配置（Env & Config）

**目标：** 为 Creem Provider/Webhook 提供最小必需配置，并与现有 Stripe 配置文档保持一致。

- [x] 在 `src/env/server.ts` 中新增并导出 Creem 服务端环境变量：
  - [x] `CREEM_API_KEY`：服务端 API Key。
  - [x] `CREEM_WEBHOOK_SECRET`：Webhook 签名校验 secret。
  - [x] 可选：`CREEM_API_URL`：Creem API 根路径（开发环境建议为 `https://test-api.creem.io/v1`，生产为 `https://api.creem.io/v1`）。
- [x] 在 `env.example` 中补充上述变量，并标注“Creem 集成（可选）”说明。
- [x] 在 `src/config/website.tsx` 或关联配置中确认/补充：
  - [x] `websiteConfig.payment.provider` 默认值切换为 `'creem'`，若需要改为 Stripe，可显式配置 `provider: 'stripe'`；具体连到 Test Mode / Live Mode 则通过 `CREEM_API_URL` + API Key 组合控制。
  - [x] 增加用于映射 plan/price ↔ Creem product/price 的配置入口（例如 `websiteConfig.payment.creem`）。
- [x] 更新文档：
  - [x] 在 `docs/env-and-ops.md` 中新增 Creem 小节：
    - [x] Base URL（`CREEM_API_URL`）说明。
    - [x] `CREEM_API_KEY` / `CREEM_WEBHOOK_SECRET` 的用途与配置建议。
    - [x] 与 Stripe 共存时如何在测试环境区分两边 webhook。
- [ ] Creem Test Mode / Endpoint 规范：
  - [ ] 非生产环境必须将 `CREEM_API_URL` 配置为 Test Mode Endpoint：`https://test-api.creem.io/v1`，并仅使用 Test Mode API Key；
  - [ ] 生产环境必须将 `CREEM_API_URL` 配置为 Live Endpoint：`https://api.creem.io/v1`，并仅使用 Live API Key；
  - [ ] 禁止出现 “Test Key + Prod URL” 或 “Live Key + Test URL” 的组合；
  - [ ] Test Mode 的具体行为与限制以官方文档为准（参考 <https://docs.creem.io/checkout-flow> 中关于 Test Mode 的说明）。

---

## 2. CreemPaymentProvider 实现（PaymentProvider 适配层）

**目标：** 在 Payment 域内实现基于 Creem 的 `PaymentProvider`，替代/并列 Stripe，保持上层调用不变。

**文件与类型：**

- 新增文件（建议路径）：
  - [x] `src/payment/services/creem-payment-adapter.ts`
- 依赖类型：
  - [x] `PaymentProvider` / `CheckoutResult` / `CreateCheckoutParams` / `CreateCreditCheckoutParams` / `CreatePortalParams` / `getSubscriptionsParams` 等（来自 `src/payment/types.ts`）。
  - [x] `WebsiteConfig` / `websiteConfig.payment`（用于 plan/price 映射）。
  - [x] `serverEnv` 中的 `creemApiKey` / `creemApiUrl`（命名以 `src/env/server.ts` 为准）。

**实现 Checklist：**

- [x] 定义 `CreemPaymentProviderDeps`：
  - [x] `creemClient: CreemClientLike`（封装 Creem REST API 调用的轻量客户端，不直接读取 env）。
  - [ ] 可选：`logger?: LoggerLike` / `planPolicy?: PlanPolicyLike`（如在 Provider 内部做 plan 校验或增强日志）。
- [x] 实现 `class CreemPaymentProvider implements PaymentProvider`：
  - [x] 构造函数注入 `CreemPaymentProviderDeps`，不直接读取 env。
  - [x] `createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>`：
    - [x] 根据 `params.planId/priceId` 从 `websiteConfig.payment.creem.subscriptionProducts` 中解析 Creem product/价格标识。
    - [x] 调用 Creem REST API 创建 checkout（通过注入的 `creemClient` 调用 `/checkouts` 等 REST 接口，后续如采用官方 SDK，可在 `creemClient` 内部替换实现）。
    - [x] 统一写入 metadata：在能从调用方 metadata 解析出 `userId` 时，通过 helper 补充 `user_id` / `product_type` / `credits?` / `provider_id: 'creem'` / `request_id` 等字段；无法解析出 `userId` 时保留原始 metadata，避免丢失调试信息。
    - [x] 将返回结果映射为 `{ url, id }`。
  - [x] `createCreditCheckout(params: CreateCreditCheckoutParams): Promise<CheckoutResult>`：
    - [x] 根据 `packageId/priceId` 映射 Creem 产品（Credits 套餐）。
    - [x] 与 `createCheckout` 相同路径创建一次性 checkout，metadata 由 helper 统一构造（含 `user_id` / `product_type: 'credits'` / `credits` 等字段），并合并调用方传入的业务字段（如 `packageId`）。
  - [x] `createCustomerPortal(params: CreatePortalParams): Promise<PortalResult>`：
    - [x] Phase A 中仅返回 Creem 托管入口 URL（`https://creem.io/my-orders/login`），本系统不承载卡信息管理 UI 或直接修改支付方式。
  - [x] `getSubscriptions(params: getSubscriptionsParams): Promise<Subscription[]>`：
    - [x] 通过 `SubscriptionQueryService + PaymentRepository` 从本地订阅/支付表读取订阅数据。
    - [x] 不调用 Creem 订阅列表 API，订阅状态由 Webhook + 事件仓储写入本地后统一暴露。
- [ ] 错误处理：
  - [ ] 对常见 Creem API 错误（认证失败/参数错误/限流等）转为统一的 `DomainError` 或至少在日志中打出结构化信息。
  - [ ] 为后续错误码文档预留占位（例如 `CREEM_CHECKOUT_FAILED` 等）。

---

### 2.1 Creem 事件类型与 metadata 约定

目标：统一 Creem Webhook 事件 payload 与 metadata 字段约定，让 `CreemPaymentProvider` 与 `CreemWebhookHandler` 之间的契约清晰可测。

- [x] 在 `src/payment/creem-types.ts` 中集中定义 Creem 相关类型：
  - [x] `CreemEventType`：枚举 `checkout.completed`、`subscription.active`、`subscription.paid`、`subscription.canceled`、`subscription.expired`、`subscription.trialing` 等事件类型（参考 raphael 的 `types/creem.ts`）。
  - [x] `CreemCustomer` / `CreemProduct` / `CreemSubscription` / `CreemOrder` / `CreemCheckout` / `CreemWebhookEvent`：仅保留 Webhook 处理所需的字段（重点关注官方提供的 `checkout.metadata` 与 `subscription.metadata`，`order` 对象暂不再承载 metadata）。
- [x] 约定 Creem 侧 metadata 使用 snake_case 字段名，并在内部定义一个对应的 TS 接口（示例命名 `CreemCheckoutMetadata`）：
  - [x] Creem metadata 字段：`user_id: string`、`product_type: 'subscription' | 'credits'`、`credits?: number`。
  - [x] 内部接口字段：`userId: string`、`productType: 'subscription' | 'credits'`、`credits?: number`。
  - [x] 在 `src/payment/services/creem-payment-adapter.ts` 中提供 `toCreemOrderMetadata` / `getMetadataFromCreemCheckout` 等 helper，用于在 snake_case 与内部 camelCase 之间转换，避免在业务代码中散落魔法字符串。
- [x] `CreemPaymentProvider.createCheckout` / `createCreditCheckout`：
  - [x] 始终通过上述 helper 构造 metadata，保证 Webhook handler 能稳定拿到 `userId` / `productType` / `credits`（官方会把 checkout metadata 持久化到 `subscription.metadata`）。
  - [x] 对订阅产品与积分产品分别填充合理的 `product_type` 与 `credits` 值。
  - [x] 在 `CreemPaymentProvider` 中生成或接受 `requestId` 并传给 Creem（作为 checkout 请求的 `request_id`），用于调试与对账（仅在 `checkout.completed` 事件上返回）；业务事实仍以事件表（Stripe/Creem 事件仓储）与 Billing/Credits 流程为唯一来源。
  - [ ] `CreemWebhookHandler`：
  - [ ] 解析 `CreemWebhookEvent` 时，统一通过 `fromCreemMetadata` 获取内部 `CreemCheckoutMetadata`；
  - [ ] 后续调用 `BillingService` / `CreditsGateway` 时只依赖该元数据与 Creem 的 `order.id` / `subscription.id`，保持领域层不耦合 Creem 具体 payload 结构。

---

## 3. PaymentProviderFactory 扩展（Provider 选择逻辑）

**目标：** 让 `DefaultPaymentProviderFactory` 能够根据 `PaymentProviderId` 返回 Creem 实现，并集中注入 env。

- [x] 更新 `src/payment/provider-factory.ts`：
  - 私有字段与工厂方法：
    - [x] 保持现有 `stripeProvider` 懒初始化逻辑不变。
    - [x] 新增 `creemProvider?: PaymentProvider` 字段，与 `stripeProvider` 行为对齐。
    - [x] 新增 `private createCreemProviderFromEnv(): PaymentProvider` 方法：
      - [x] 内部调用 `createCreemPaymentProviderFromEnv(...)`，集中负责从 env 构造 `CreemPaymentProvider`；
      - [x] `createCreemPaymentProviderFromEnv` 本身在 `src/payment/services/creem-payment-factory.ts` 中实现，通过 `createCreemClientFromEnv` 读取 `CREEM_*` 并构造 `CreemPaymentProvider`。
  - `getProvider(ctx?: PaymentContext): PaymentProvider`：
    - [x] 保持当前模式：`const providerId = ctx?.providerId ?? 'stripe';`
    - [x] `case 'stripe'`：返回现有 `stripeProvider`。
    - [x] `case 'creem'`：
      - [x] 在非 production 环境：懒初始化并返回 `creemProvider`，允许在本地/测试环境真实使用 Creem Provider；
      - [x] 在 production 环境：通过配置 `CREEM_API_URL` + Live API Key 连接 Creem 正式环境，无需额外 Phase Gate。
    - [x] `default`：抛出 `Unsupported payment provider: ${providerId}`。
- [x] 维持现有分层：`src/payment/index.ts` 负责从 `websiteConfig.payment.provider` 读取配置并通过 `paymentProviderFactory.getProvider({ providerId })` 传入上下文，`DefaultPaymentProviderFactory` 不再直接依赖 `websiteConfig`。

---

## 4. Creem Webhook 入口与组合根

**目标：** 新增 `/api/webhooks/creem` 路由，与 Stripe Webhook 完全对称，统一处理日志与错误 envelope。

### 4.1 API Route

  - [x] 新增 `src/app/api/webhooks/creem/route.ts`：
  - [x] 使用 `createLoggerFromHeaders(request.headers, { span: 'api.webhooks.creem', route: '/api/webhooks/creem' })` 初始化 logger。
  - [x] 读取原始 `payload = await request.text()`。
  - [x] 从 headers 中读取 Creem 提供的签名字段（当前使用 `creem-signature` header，与实现保持一致）。
  - [x] 调用 `handleCreemWebhook(payload, request.headers)`（实现位于 `src/lib/server/creem-webhook.ts`）。
  - [x] 捕获 `DomainError`：
    - [x] 映射到标准 JSON envelope：`{ success: false, error, code, retryable }`。
  - [x] 捕获未知错误：
    - [x] 记录 `logger.error` 并返回 `{ success: false, error: 'Webhook handler failed', code: 'UNEXPECTED_ERROR', retryable: true }`。
  - [x] Return URL 安全边界：与前端约定保持一致，Return URL 仅用于用户体验（如展示成功/失败状态或跳转），**不得在 Return URL handler 中直接发放积分或修改账本**，所有订阅/支付最终状态更新必须由 `/api/webhooks/creem` 驱动。
  - [ ] Return URL 参数签名与授权约束：如果在任何场景下需要依据 Creem 回传的查询参数做安全相关决策（例如 gate 某些敏感操作或防刷逻辑），必须按照官方文档 `Return URLs > How to verify Creem signature?` 所述实现签名校验逻辑（基于参数拼接 + API Key 作为 salt 计算 SHA256）。未通过校验的参数一律视为不可信输入，不得用于修改账本或授予权限；即便通过签名校验，也仅可用于低风险的 UX 或幂等校验，严禁用于授予长期权限、变更计费主体等高风险操作。
  - [ ] success_url 与重定向实践：创建 checkout session 时，由后端统一设置 `success_url`（不要依赖 Creem Dashboard 上的默认值），确保各环境有清晰区分。前端在拿到 checkout URL 后，必须在同一窗口发起重定向（如 `location.href = checkoutUrl`），禁止通过 `window.open()` 或 `target="_blank"` 打开，以避免被 Safari 等浏览器作为弹窗拦截。Creem 在成功支付后会携带固定查询参数重定向到 `success_url`，这些参数仅作为展示状态/轻量 UX 辅助，业务事实仍以 webhook 事件为唯一来源。

### 4.2 组合根 handleCreemWebhook

  - [x] 新增 `src/lib/server/creem-webhook.ts`：
  - [x] 导出 `async function handleCreemWebhook(payload: string, headers: Headers)`：
    - [x] 从 `serverEnv` 中读取 `creemApiKey` / `creemWebhookSecret`，缺失时抛出明确错误（例如 `CREEM_WEBHOOK_MISCONFIGURED`）。
    - [x] 构造 Creem webhook 验签器（当前使用自定义 `verifyCreemWebhookSignature` + HMAC-SHA256），严格按照 Creem 官方签名校验规范（header 名称 + HMAC 算法）完成验签；签名失败映射为 `PAYMENT_SECURITY_VIOLATION` 或未来的 `CREEM_WEBHOOK_SECURITY_VIOLATION`。
  - [x] TODO（生产前）：对照 Creem 官方文档确认签名 header 名称与算法实现是否完全一致；如官方提供推荐实现（SDK 或示例代码），需评估将 `verifyCreemWebhookSignature` 调整为官方推荐方式。（已采用 `creem-signature` header + HMAC-SHA256 计算十六进制签名，并使用 `crypto.timingSafeEqual(Buffer, Buffer)` 校验；Creem Webhook 原始 JSON 已持久化到 `creem_event.payload` 字段，用于审计与排障。）
    - [x] 构建依赖对象：
      - [x] `paymentRepository`（现有 `PaymentRepository` 或其接口）。
      - [x] `creemEventRepository`（新建，或在现有 `stripe_event` 表上增加 provider 字段以复用）。
      - [x] `creditsGateway`（`CreditLedgerService` 实例）。
      - [x] `billingService`（`DefaultBillingService`）。
      - [x] `logger`（从调用方注入的 logger）。
    - [x] 构造 `CreemWebhookHandler` 并调用 `handler.handleWebhookEvent(event, payload)`，其中 `event` 为解析后的 `CreemWebhookEvent`，`payload` 为原始 JSON 字符串（用于审计与验签）。

---

## 5. CreemWebhookHandler 与数据访问层

**目标：** 与 `StripeWebhookHandler` 类似，集中处理事件验签、幂等与 Payment/Billing/Credits 协作。

- [x] 新增 `src/payment/services/creem-webhook-handler.ts`：
  - [x] 定义依赖类型 `CreemWebhookHandlerDeps`：
    - [x] `paymentRepository: PaymentRepositoryLike`。
    - [x] `creemEventRepository: CreemEventRepositoryLike`。
    - [x] `billingService: BillingServiceLike`。
    - [x] `creditsGateway: CreditsGateway`。
    - [x] `logger: LoggerLike`。
  - [x] `async handleWebhookEvent(event: CreemWebhookEvent)`：
    - [x] 使用 `paymentEventRepository.withEventProcessingLock('creem', { eventId: event.id, type: event.eventType, createdAt: new Date(event.created_at) }, async () => { ... })` 保证幂等。
    - [x] 根据事件类型分发：
      - [x] `checkout.completed`（一次性支付）：
        - [x] 从 `event.object`（`CreemCheckout`）中解析 metadata（优先 `subscription.metadata`，回退 `checkout.metadata`）→ `CreemCheckoutMetadata`（`userId/productType/credits`）；
        - [x] 仅当 `checkout.status = 'completed'` 且 `order.status = 'paid'` 时才继续履约，其余状态仅记录日志不授予任何访问或积分；
        - [x] 写/更新 `payment` 表，记录一次性支付（Credits/Lifetime 等）；
        - [x] 当 `productType = 'credits'` 时，调用 `creditsGateway.addCredits(...)` 或等价入口发放一次性 Credits；如有 Lifetime 产品，则在满足上述状态校验的前提下，在该分支中调用 `billingService.grantLifetimePlan`（作为一次性终身计划授予入口）。
      - [x] 订阅相关事件（`subscription.active` / `subscription.paid` / `subscription.canceled` / `subscription.expired` / `subscription.trialing`）：
        - [x] 从 `event.object`（`CreemSubscription`）及其 metadata 中解析出内部订阅上下文（`userId/priceId/periodStart/periodEnd/status` 等），通过统一 helper `mapCreemSubscriptionToInternal` 完成映射；
        - [x] 写/更新 `payment` / 订阅记录，保持与 Stripe 路径一致的字段语义；
        - [x] 当事件类型为 `subscription.paid` 时，调用 `billingService.handleRenewal` 触发 Credits 续发或订阅续期（作为激活/续费的主事件）；其它状态（如 `subscription.active`）仅用于同步本地订阅状态，不直接授予访问。
    - [x] 对未知/暂不支持的事件类型记录 `logger.info` 或 `logger.warn`，并安全返回成功（避免 webhook 重试风暴）。

- [ ] 数据访问层：
  - [x] 如果新建 Creem 事件表：
    - [x] 在 `src/db/schema.ts` 中定义 `creem_event` 表（字段与 `stripe_event` 相近，包含 `eventId`, `type`, `createdAt`, `processedAt`, `payload` 等，`payload` 持久化原始事件 JSON 以便审计与排错）。
    - [x] 新增 `src/payment/data-access/creem-event-repository.ts`，实现 `withEventProcessingLock` 等接口。

---

## 6. Billing / Credits 集成点

**目标：** 让 Creem webhook 事件与现有 Billing/Credits 流程对齐，保持业务行为与 Stripe 路径一致。

- [x] 复用 `src/domain/billing/billing-service.ts` 中的入口方法：
  - [x] `startSubscriptionCheckout` / `startCreditCheckout`：
    - [x] 通过 `getPaymentProvider()` 调用对应 Provider（当 `websiteConfig.payment.provider = 'creem'` 时走 Creem）。
  - [x] `handleRenewal`：
    - [x] 在 Creem 订阅续费相关事件中调用，逻辑与 Stripe 分支保持一致。
  - [x] `grantLifetimePlan`：
    - [x] 在 Creem 对应的一次性付款事件中调用。
- [x] Credits 侧（`src/credits/services/credit-ledger-service.ts` 等）：
  - [x] 确认 `addCredits` / `addSubscriptionCredits` / `addLifetimeMonthlyCredits` 接口足够支撑 Creem 事件触发，无需 Provider 感知。
  - [ ] 如有必要，可为 Creem 特有场景新增小的包装方法，但优先复用现有接口。

---

## 7. 测试与文档更新（Phase A 范围）

- [ ] 测试（建议但视时间量级可分批实施）：
  - [ ] 为 `CreemPaymentProvider` 添加单元测试（mock Creem API 调用）：
    - [x] 成功创建 checkout / credit checkout / portal。
    - [ ] 错误场景（认证失败/参数错误）抛出合理错误。
  - [x] 为 `paymentProviderFactory` 添加测试：
    - [x] `websiteConfig.payment.provider = 'creem'` 时返回 Creem 实现。
    - [x] 未配置/配置错误时抛出预期错误。
  - [x] 为 `CreemWebhookHandler` 添加测试：
    - [x] 订阅续费事件触发 `billingService.handleRenewal` 与 Credits 发放。
    - [x] 一次性支付事件触发 `addCredits`。
    - [x] 幂等测试：重复同一 `event.id` 只处理一次。
- [x] 文档：
  - [x] 更新 `docs/payment-lifecycle.md`：
    - [x] 增加 “Creem 支付流程（PaymentProvider + /api/webhooks/creem）” 小节，与 Stripe 部分并列。
    - [x] 明确两条链路在 Payment/Billing/Credits 层的对齐关系。
  - [x] 更新 `docs/env-and-ops.md` 中 Stripe Webhook 部分，增加一句 Creem Webhook 对应入口说明。
  - [ ] 如引入新的错误码（例如 `CREEM_WEBHOOK_SECURITY_VIOLATION` / `CREEM_WEBHOOK_UNEXPECTED_ERROR`），同步更新：
    - [ ] `src/lib/server/error-codes.ts`
    - [ ] `docs/error-codes.md`
    - [ ] `src/lib/domain-error-utils.ts`（如需要前端文案）
    - [ ] `src/lib/domain-error-ui-registry.ts`（错误 UI 策略）

---

## 8. Phase B/Beyond 的预留点（仅标注，不在本阶段实现）

- [ ] 在 `src/lib/auth.ts` / `auth-client` 中为未来接入 `@creem_io/better-auth` 插件预留注释与 TODO（不改当前逻辑）：
  - [ ] 标注“Phase B: 使用 Creem Better Auth 插件提供 hasAccess/客户端 checkout 辅助能力”的位置。
- [ ] 在 `docs/feature-modules.md` 或 `docs/governance-index.md` 中补充一条注记：
  - [ ] Payment/Billing/Credits 仍是计费事实来源；
  - [ ] Better Auth 插件仅作为辅助访问控制/查询视图，避免双源事实。

---

## 9. 与 Raphael Starter Kit 的 Creem 集成对比与借鉴要点

> 参考目录：`raphael-starterkit-v1-main`（Next.js + Supabase + Creem 成功集成范例）。

**9.1 该库的集成模式概览**

- 直接使用 Creem REST API + 自定义 TS 类型：
  - `CREEM_API_KEY` / `CREEM_API_URL` / `CREEM_WEBHOOK_SECRET` 等 env；
  - 类型定义集中在 `types/creem.ts`。
- Webhook：
  - 单一入口：`app/api/webhooks/creem/route.ts`；
  - 使用 `creem-signature` + HMAC-SHA256 手动校验（`utils/creem/verify-signature.ts`）；
  - 按 `eventType`（`checkout.completed` / `subscription.*`）分派到 handler，写入 Supabase。
- 本地状态：
  - 使用 Supabase 表 `customers` / `subscriptions` / `credits_history` 持久化 `creem_customer_id` / `creem_subscription_id` / `creem_product_id` / `creem_order_id` 等；
  - Credits 通过 `addCreditsToCustomer` / `useCredits` 等函数直接操作 Supabase。
- 前端调用：
  - Customer Portal：`/api/creem/customer-portal` 调 `POST /customers/billing` 获取管理链接；
  - Checkout：前端调用自建 `/api/creem/create-checkout`（本模板中仅留有调用示例，对应 route 可在其它分支实现）。

**9.2 可以直接借鉴的模式**

- Webhook 入口设计：
  - 独立 `/api/webhooks/creem` 路由；
  - 读取原始 body + header 签名，先验签、后解包、再按事件类型分发。
- 事件分派与“幂等键”的选择：
  - 使用 `event.id` / `subscription.id` / `order.id` 作为幂等/关联键，分别落在事件表、本地 subscription、credits 交易表上；
  - 事件分派粒度与我们计划中的 `CreemWebhookHandler.handleWebhookEvent` 非常接近，可作为事件类型枚举和典型分支参考。
- metadata 用法：
  - 在 checkout metadata 中携带 `user_id` / `product_type` / `credits` 等业务字段；
  - Webhook handler 通过 metadata 将 Creem 事件可靠地映射回本地用户与业务上下文。

**9.3 不建议直接照搬的部分（需要按本仓库架构重构）**

- 直连 Supabase/表的模式：
  - Raphael Starter Kit 在 Webhook 中直接调用 Supabase 客户端更新 `customers` / `subscriptions` / `credits_history`；
  - 本模板已有成熟的 `PaymentRepository` / `BillingService` / `CreditsGateway` / Drizzle schema，Creem 集成应通过这些领域服务/仓储来更新状态，而不是引入新的直接 DB 访问层。
- 将 Credits/Subscription 逻辑耦合到单一 `customers` 表：
  - 本模板已经在 `src/credits` / `src/domain/billing` 中定义了更细粒度的 Credits 账本和订阅策略；
  - Creem 集成应映射到现有 Credits 账本模型，而不是引入新的“credits_history + customers.credits”模式。
- 缺少统一错误码/Envelope 的 Webhook 响应：
  - Raphael 直接返回 `NextResponse` + 文本/JSON；
  - 本模板需要继续沿用 `DomainError` + `ErrorCodes` + Envelope 的错误模型（在 `src/app/api/webhooks/creem/route.ts` 中对齐 Stripe 行为）。

**9.4 对本计划的具体启发**

- 在实现 `CreemWebhookHandler` 时：
  - 可以参考 `CreemEventType` / `CreemWebhookEvent` 的建模方式；
  - 事件分支结构可以复用 Raphael 中的分类（checkout.completed / subscription.active / subscription.paid / canceled / expired / trialing）。
- 在设计 metadata 约定与 Credits 映射时：
  - 借鉴 Raphael 的 `product_type` + `credits` 字段约定；
  - 但在 handler 内部要调用 `BillingService` / `CreditsGateway` 来发放积分/更新订阅，而不是直接写表。

> metadata 字段命名与取值范围见上文“2.1 Creem 事件类型与 metadata 约定”，实现 `CreemWebhookHandler` 和 `CreemPaymentProvider` 时请复用其中的 helper 与类型。

---

## 10. Phase A 方案 1：工厂懒初始化 & 事件仓储抽象详细执行计划

> 本节保留了最初“按 Provider 懒初始化 + 显式 Phase Gate”的设计细节。当前实现已经改为默认使用 Creem，并通过 `CREEM_API_URL` + API Key 的组合来区分 Test/Live 环境，因此以下步骤可视为历史背景或回溯资料。

### 10.1 DefaultPaymentProviderFactory 改造（懒初始化 + Phase Gate）

目标：

- 保持现有 `DefaultPaymentProviderFactory` 入口与类型不变；
- 将 Stripe 初始化从构造函数移动到 `getProvider` 内部的按需懒加载逻辑；
- 为 `'creem'` 分支增加显式 Phase Gate 错误，引导阅读 `.codex/plan/creem-payment-integration.md`；
- 为 Phase A 完成后支持 “只启用 Creem、未配置 Stripe env” 铺路。

步骤：

1. 调整构造函数语义（`src/payment/provider-factory.ts`）：
   - 将当前在构造函数中直接调用 `createStripePaymentProviderFromEnv(...)` 的逻辑拆出为私有工厂方法，如 `private createStripeProviderFromEnv(overrides?: StripeProviderOverrides)`；
   - 构造函数仅保存 `overrides` 或必要配置引用（如 `serverEnv`），不再抛出 Stripe 配置相关错误。
2. 引入懒初始化字段：
   - 在类中增加 `private stripeProvider?: PaymentProvider;` 字段；
   - 在 `'stripe'` 分支中：
     - 若 `this.stripeProvider` 未初始化，则调用 `createStripeProviderFromEnv(...)`；
     - 由 `createStripePaymentProviderFromEnv` 内部负责在 Stripe env 不完整时抛出明确错误（保持现有快速失败行为）。
3. 为 `'creem'` 分支增加 Phase Gate 错误信息：
   - 在 `getProvider` 的 `switch (providerId)` 中：
     - 暂时保留 `'creem'` 分支，但抛出 **更具引导性的错误**，例如：
       - `"Payment provider 'creem' is not yet implemented. See .codex/plan/creem-payment-integration.md (Phase A) and docs/governance-index.md for progress and usage constraints."`；
     - 确保错误信息中包含：
       - `'creem' 仍处于 Phase A 集成阶段，尚不可在 websiteConfig.payment.provider 中启用`；
       - 指向 `.codex/plan/creem-payment-integration.md` 和 `docs/governance-index.md`。
4. 默认 provider 行为检查：
   - 保持 `ctx?.providerId ?? 'stripe'` 作为缺省逻辑；
   - 在文档中明确：Phase A 期间若未显式配置 `websiteConfig.payment.provider`，系统行为等同 `'stripe'`，Creem 只在显式配置 `'creem'` 时参与选择。
5. 为未来 Creem 懒初始化预留接口：
   - 在工厂类中预留 `private creemProvider?: PaymentProvider;` 字段（不在 Phase A 前半段实现实际创建逻辑）；
   - 预留 `private createCreemProviderFromEnv(...)` 方法签名（具体实现放在 Phase A “CreemPaymentProvider 实现”子任务中）。

预期结果：

- Stripe-only 场景行为保持不变，仍在第一次请求 Stripe Provider 时因 env 不完整快速失败；
- `websiteConfig.payment.provider = 'creem'` 在 Phase A 未完成前会抛出带指引文档链接的错误，而非简单 `"Unsupported payment provider: creem"`；
- Phase A 完成后，仅需在 `'creem'` 分支中调用 `createCreemProviderFromEnv` 并初始化 `this.creemProvider`，即可支持 “只配置 Creem env、不配置 Stripe env” 的运行模式。

### 10.2 PaymentEventRepository 抽象与事件表策略

目标：

- 保持现有 `stripe_event` 表 **专用于 Stripe**，不做破坏性迁移；
- 为 Creem 引入独立的 `creem_event` 表，实现同等级的幂等与审计能力；
- 在代码层抽象统一的事件仓储接口 `PaymentEventRepository`（或等价命名），让 Webhook Handler 仅依赖抽象而不关心具体表名。

步骤：

1. 抽象事件仓储接口：
   - 在 `src/payment/data-access` 下新增接口定义文件，例如 `payment-event-repository.ts`：
     - 定义 `PaymentEventProviderId = 'stripe' | 'creem'`（与 `PaymentProviderId` 对齐或共享）；
     - 定义 `PaymentEventRepository` 接口，至少包含：
       - `withEventProcessingLock(providerId: PaymentEventProviderId, eventId: string, handler: () => Promise<void>): Promise<void>`；
       - 如需要读取事件记录，可增加 `getEventById(providerId, eventId)` 等方法。
2. 适配现有 `StripeEventRepository`：
   - 在 `src/payment/data-access/stripe-event-repository.ts` 中：
     - 保持对 `stripe_event` 表的读写与幂等逻辑不变；
     - 实现 `PaymentEventRepository` 接口的 Stripe 分支行为：
       - `withEventProcessingLock('stripe', eventId, handler)` 委托当前实现；
     - 若已有类型/函数命名紧耦合 Stripe，可通过小范围重构对齐新的接口（例如增加一层适配，而非大改原有实现）。
3. 预留 Creem 事件仓储实现：
   - 新增 `src/payment/data-access/creem-event-repository.ts`（Phase A 后半段实现）：
     - 基于 `creem_event` 表（Phase A 迁移任务中定义 Drizzle schema）；
     - 实现 `PaymentEventRepository` 接口的 `'creem'` 分支；
     - 参考 Stripe 仓储的锁定/幂等模式，复用尽可能多的模式与测试思路。
4. Webhook Handler 依赖调整：
   - `StripeWebhookHandler`（`src/payment/services/stripe-webhook-handler.ts`）：
     - 构造函数依赖从 `StripeEventRepository` 过渡到 `PaymentEventRepository` 抽象（或引入一个新的组合根，在内部注入 stripe 专用实现）；
     - 业务逻辑层面保持不变，仅替换调用接口。
   - 未来 `CreemWebhookHandler`：
     - 直接依赖同一 `PaymentEventRepository` 抽象；
     - 使用 `'creem'` 作为 providerId，复用统一事件幂等框架。

预期结果：

- `stripe_event` 继续只承载 Stripe Webhook 事件，不被 Creem 污染；
- 代码层事件仓储依赖统一通过 `PaymentEventRepository` 抽象，便于增加新的 Provider；
- Phase A 在引入 Creem Webhook 时，只需实现 `creem_event` 表及其仓储实现，无需修改 Stripe Webhook 核心逻辑。

### 10.3 文档与 env 协议更新（防误用、明确 Phase Gate）

目标：

- 防止团队成员误认为 `'creem'` 已经可用；
- 将 “Phase A 才支持 Creem-only” 的约束写入正式文档与示例 env；
- 在错误信息与文档中形成闭环：错误 → `.codex/plan` → `docs/governance-index.md`。

步骤：

1. `src/payment/types.ts` 注释增强：
   - 在 `PaymentProviderId = 'stripe' | 'creem'` 的注释中：
     - 强调 `'creem'` 当前仍处于 Phase A 集成阶段；
     - 明确指出：在完成本计划 Phase A 之前，将 `websiteConfig.payment.provider` 配置为 `'creem'` 会触发工厂层面的 Phase Gate 错误，而非实际可用 Provider。
2. `docs/payment-lifecycle.md` 更新：
   - 在 “2.1 Provider 与服务” 小节中：
     - 补充说明：
       - 当前默认 Provider 为 Stripe；
       - `PaymentProviderId` 类型包含 `'creem'` 仅代表未来支持方向，Phase A 完成前不可在运行时启用；
       - `DefaultPaymentProviderFactory` 会在 `'creem'` 分支抛出带 `.codex/plan/creem-payment-integration.md` 链接的错误。
3. `docs/env-and-ops.md` 更新：
   - 在 Stripe 小节后增加 “Creem（规划中）” 小节：
     - 列出预期 env：`CREEM_API_KEY`、`CREEM_WEBHOOK_SECRET`、`CREEM_TEST_MODE` 等；
     - 明确标注：
       - 这些 env 目前仅用于 Phase A 内部开发和预配置；
       - 在 `.codex/plan/creem-payment-integration.md` 标记 Phase A 完成之前，将 `websiteConfig.payment.provider` 设置为 `'creem'` 会导致工厂抛出 Phase Gate 错误，而不会启用真实 Creem 支付。
4. `docs/governance-index.md` 更新：
   - 在“协议/技术债报告”或“Payment/Billing 协议”部分：
     - 增加对 `.codex/plan/creem-payment-integration.md` 的显式引用；
     - 简要说明当前 Creem 集成状态（例如：“状态：设计中 / Phase A 未完成，禁止在生产配置 provider = 'creem'”）。
5. 统一在上述文档（尤其是 `docs/payment-lifecycle.md` 与 `docs/env-and-ops.md`）中增加 Creem 官方文档入口链接，例如：“Creem 官方文档：https://docs.creem.io”，作为深入了解 Checkout / Webhook / Metadata 协议的权威参考。

预期结果：

- 类型、工厂实现、错误信息与文档在 “Creem 仍在 Phase A，不可运行时启用” 这一点上保持一致；
- 团队成员在看到错误信息时，可以顺利根据提示找到 `.codex/plan` 与治理文档，避免误判 Creem 已可用。

### 10.4 测试计划（围绕工厂与事件仓储）

目标：

- 为工厂懒初始化行为与 Phase Gate 提供单元测试覆盖；
- 为事件仓储抽象提供基础测试，确保 Stripe 路径回归安全，并为 Creem 实现预留测试用例模板。

步骤：

1. `DefaultPaymentProviderFactory` 测试增强（`src/payment/__tests__/provider-factory.test.ts`）：
   - 新增用例：
     - 构造工厂时不触发 Stripe env 校验（缺失 `STRIPE_SECRET_KEY` 也不会在构造阶段抛错）；
     - 在 `getProvider({ providerId: 'stripe' })` 调用时，缺失 Stripe env 会抛出当前预期的 Stripe 配置错误；
     - 在 `getProvider({ providerId: 'creem' })` 时，抛出 Phase Gate 错误，且错误 message 包含 `.codex/plan/creem-payment-integration.md` 文本；
     - 未传 `providerId` 时，仍等价于 `'stripe'` 行为。
2. PaymentEventRepository 抽象测试：
   - 为新接口增加最小单元测试：
     - `StripeEventRepository` 通过 `PaymentEventRepository` 接口执行 `withEventProcessingLock('stripe', ...)` 时，与旧逻辑结果一致；
     - 幂等行为不变（重复同一 `event.id` 只处理一次）。
   - 为未来 `CreemEventRepository` 预留测试模板（可在 Phase A 后半段填充）。

预期结果：

- 工厂初始化行为、Phase Gate 逻辑与 Stripe 回归路径都有稳定的单元测试覆盖；
- 事件仓储抽象不会引入回归，为后续 Creem 实现提供清晰测试支点。


> 本计划仅为 Phase A 的文件/函数级 checklist，执行时请严格遵守现有架构文档与 `.codex/rules` 中的约束，优先复用 Stripe 路径的设计与实现模式。
