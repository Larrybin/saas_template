---
title: Creem Payment 集成计划（Phase A：Payment Provider + Webhook + Billing/Credits 打通）
description: 在现有 Stripe 架构下，引入 Creem 作为新的 Payment Provider，通过 /api/webhooks/creem 打通 Payment → Billing → Credits 链路，为后续 Better Auth 插件集成预留扩展点。
---

## 0. 范围与目标

- 仅实现 **Phase A：Payment 域主干 + Creem Webhook + Billing/Credits 打通**。
- 不改动现有 Stripe 行为，不删不废弃，仅在其旁边新增 Creem 通路。
- 不改 UI / 路由对外 API 约定（`createCheckout` / `createCreditCheckout` / `createCustomerPortal` / `getSubscriptions` 保持接口不变）。
- 为未来 Phase B（Better Auth Creem 插件 hasAccess/客户端 API）预留清晰扩展点，但本阶段不接入插件。

---

## 1. 环境变量与配置（Env & Config）

**目标：** 为 Creem Provider/Webhook 提供最小必需配置，并与现有 Stripe 配置文档保持一致。

- [ ] 在 `src/env/server.ts` 中新增并导出 Creem 服务端环境变量：
  - [ ] `CREEM_API_KEY`：服务端 API Key。
  - [ ] `CREEM_WEBHOOK_SECRET`：Webhook 签名校验 secret。
  - [ ] 可选：`CREEM_TEST_MODE`（或等价布尔配置），控制 `test-api.creem.io` vs `api.creem.io`。
- [ ] 在 `env.example` 中补充上述变量，并标注“Creem 集成（可选）”说明。
- [ ] 在 `src/config/website.tsx` 或关联配置中确认/补充：
  - [ ] `websiteConfig.payment.provider` 支持 `'creem'` 选项（类型上已在 `PaymentProviderId` 中声明），但在本计划 Phase A 完成之前，实际运行时配置仍必须保持为 `'stripe'`，否则当前工厂实现会抛出 `Unsupported payment provider: creem` 错误。
  - [ ] 若需要，增加用于映射 plan/price ↔ Creem product/price 的配置入口（例如 `websiteConfig.payment.creem`）。
- [ ] 更新文档：
  - [ ] 在 `docs/env-and-ops.md` 中新增 Creem 小节：
    - [ ] Base URL 与 test-mode 说明。
    - [ ] `CREEM_API_KEY` / `CREEM_WEBHOOK_SECRET` 的用途与配置建议。
    - [ ] 与 Stripe 共存时如何在测试环境区分两边 webhook。

---

## 2. CreemPaymentProvider 实现（PaymentProvider 适配层）

**目标：** 在 Payment 域内实现基于 Creem 的 `PaymentProvider`，替代/并列 Stripe，保持上层调用不变。

**文件与类型：**

- 新增文件（建议路径）：
  - [ ] `src/payment/services/creem-payment-adapter.ts`
- 依赖类型：
  - [ ] `PaymentProvider` / `CheckoutResult` / `CreateCheckoutParams` / `CreateCreditCheckoutParams` / `CreatePortalParams` / `getSubscriptionsParams` 等（来自 `src/payment/types.ts`）。
  - [ ] `WebsiteConfig` / `websiteConfig.payment`（用于 plan/price 映射）。
  - [ ] `serverEnv` 中的 `creemApiKey` / `creemTestMode`（命名以 `src/env/server.ts` 为准）。

**实现 Checklist：**

- [ ] 定义 `CreemPaymentProviderDeps`：
  - [ ] `apiKey: string`
  - [ ] `testMode: boolean`
  - [ ] 可选：`baseUrl?: string`（如需覆盖默认 Creem API 根路径）
  - [ ] 可选：`logger?: LoggerLike`
  - [ ] 可选：`planPolicy?: PlanPolicyLike`（如果在 Provider 内部做 plan 校验）
- [ ] 实现 `class CreemPaymentProvider implements PaymentProvider`：
  - [ ] 构造函数注入 `CreemPaymentProviderDeps`，不直接读取 env。
  - [ ] `createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>`：
    - [ ] 根据 `params.planId/priceId` 从 `websiteConfig` 或 PlanPolicy 中解析 Creem product/价格标识。
    - [ ] 调用 Creem API / SDK 创建 checkout（`POST /v1/checkouts` 或 SDK 对应方法）。
    - [ ] 将返回结果映射为 `{ url, id }`。
  - [ ] `createCreditCheckout(params: CreateCreditCheckoutParams): Promise<CheckoutResult>`：
    - [ ] 根据 `packageId/priceId` 映射 Creem 产品（Credits 套餐）。
    - [ ] 与 `createCheckout` 相同路径创建一次性 checkout。
  - [ ] `createCustomerPortal(params: CreatePortalParams): Promise<PortalResult>`：
    - [ ] 调用 Creem 提供的“Customer Portal”或等价功能（如有直接 API），返回 `{ url }`。
  - [ ] `getSubscriptions(params: getSubscriptionsParams): Promise<Subscription[]>`：
    - [ ] 基于 `userId` 找到对应 Creem customer（可通过 custom metadata / 映射表；具体策略后续细化）。
    - [ ] 调用 Creem 订阅查询接口，将结果映射为内部 `Subscription` 类型。
- [ ] 错误处理：
  - [ ] 对常见 Creem API 错误（认证失败/参数错误/限流等）转为统一的 `DomainError` 或至少在日志中打出结构化信息。
  - [ ] 为后续错误码文档预留占位（例如 `CREEM_CHECKOUT_FAILED` 等）。

---

## 3. PaymentProviderFactory 扩展（Provider 选择逻辑）

**目标：** 让 `DefaultPaymentProviderFactory` 能够根据 `PaymentProviderId` 返回 Creem 实现，并集中注入 env。

- [ ] 更新 `src/payment/provider-factory.ts`：
  - 构造函数：
    - [ ] 保持现有 `stripeProvider` 构造逻辑不变。
    - [ ] 新增 `creemProvider` 字段：
      - [ ] 建议仿照 `stripe-payment-factory.ts` 新增 `src/payment/services/creem-payment-factory.ts`：
        - [ ] 提供 `createCreemPaymentProviderFromEnv(env, overrides?)`，在该工厂中集中读取 `serverEnv` 中的 `CREEM_*` 配置并构造 `CreemPaymentProvider`。
      - [ ] 在 `DefaultPaymentProviderFactory` 构造函数中调用 `createCreemPaymentProviderFromEnv` 构造单例 `creemProvider`。
  - `getProvider(ctx?: PaymentContext): PaymentProvider`：
    - [ ] 保持当前模式：`const providerId = ctx?.providerId ?? 'stripe';`
    - [ ] `case 'stripe'`：返回现有 `stripeProvider`。
    - [ ] `case 'creem'`：返回新建的 `creemProvider`。
    - [ ] `default`：抛出 `Unsupported payment provider: ${providerId}`。
- [ ] 维持现有分层：`src/payment/index.ts` 负责从 `websiteConfig.payment.provider` 读取配置并通过 `paymentProviderFactory.getProvider({ providerId })` 传入上下文，`DefaultPaymentProviderFactory` 不再直接依赖 `websiteConfig`。

---

## 4. Creem Webhook 入口与组合根

**目标：** 新增 `/api/webhooks/creem` 路由，与 Stripe Webhook 完全对称，统一处理日志与错误 envelope。

### 4.1 API Route

- [ ] 新增 `src/app/api/webhooks/creem/route.ts`：
  - [ ] 使用 `createLoggerFromHeaders(request.headers, { span: 'api.webhooks.creem', route: '/api/webhooks/creem' })` 初始化 logger。
  - [ ] 读取原始 `payload = await request.text()`。
  - [ ] 从 headers 中读取 Creem 提供的签名字段（例如 `x-creem-signature`，具体名称参考 Creem 文档）。
  - [ ] 调用 `handleCreemWebhook(payload, headersOrSignature)`（实现位于 `src/lib/server/creem-webhook.ts`）。
  - [ ] 捕获 `DomainError`：
    - [ ] 映射到标准 JSON envelope：`{ success: false, error, code, retryable }`。
  - [ ] 捕获未知错误：
    - [ ] 记录 `logger.error` 并返回 `{ success: false, error: 'Webhook handler failed', code: 'CREEM_WEBHOOK_UNEXPECTED_ERROR', retryable: true }`。

### 4.2 组合根 handleCreemWebhook

- [ ] 新增 `src/lib/server/creem-webhook.ts`：
  - [ ] 导出 `async function handleCreemWebhook(payload: string, headersOrSignature: Headers | string)`：
    - [ ] 从 `serverEnv` 中读取 `creemApiKey` / `creemWebhookSecret`，缺失时抛出明确错误（例如 `CREEM_WEBHOOK_MISCONFIGURED`）。
    - [ ] 构造 Creem client / webhook 验证器（使用官方 SDK 或 Next.js adapter helper）。
    - [ ] 构建依赖对象：
      - [ ] `paymentRepository`（现有 `PaymentRepository` 或其接口）。
      - [ ] `creemEventRepository`（新建，或在现有 `stripe_event` 表上增加 provider 字段以复用）。
      - [ ] `creditsGateway`（`CreditLedgerService` 实例）。
      - [ ] `billingService`（`DefaultBillingService`）。
      - [ ] `logger`（从调用方注入的 logger）。
    - [ ] 构造 `CreemWebhookHandler` 并调用 `handler.handleWebhookEvent(payload, headersOrSignature)`。

---

## 5. CreemWebhookHandler 与数据访问层

**目标：** 与 `StripeWebhookHandler` 类似，集中处理事件验签、幂等与 Payment/Billing/Credits 协作。

- [ ] 新增 `src/payment/services/creem-webhook-handler.ts`：
  - [ ] 定义依赖类型 `CreemWebhookHandlerDeps`：
    - [ ] `creemClient` / `webhookSecret` / `eventVerifier`（具体根据 Creem SDK API 设计）。
    - [ ] `paymentRepository: PaymentRepositoryLike`。
    - [ ] `creemEventRepository: CreemEventRepositoryLike`。
    - [ ] `billingService: BillingServiceLike`。
    - [ ] `creditsGateway: CreditsGateway`。
    - [ ] `logger: LoggerLike`。
  - [ ] `async handleWebhookEvent(payload, headersOrSignature)`：
    - [ ] 验证签名并解析 Creem 事件对象。
    - [ ] 使用 `creemEventRepository.withEventProcessingLock(event.id, async () => { ... })` 保证幂等。
    - [ ] 根据事件类型分发：
      - [ ] 订阅创建/激活事件：
        - [ ] 写/更新 `payment` 表；
        - [ ] 调用 `billingService.handleRenewal` 或等价入口发放初始/周期性 Credits。
      - [ ] 一次性支付成功事件（用于 Credits 套餐）：
        - [ ] 写 `payment` 表；
        - [ ] 调用 `creditsGateway.addCredits(...)` 或 `billingService.startCreditPackageFulfillment`。
      - [ ] Lifetime 相关支付（如适用）：
        - [ ] 调用 `billingService.grantLifetimePlan` → `MembershipService` + `CreditsGateway.addLifetimeMonthlyCredits`。
    - [ ] 对未知/暂不支持的事件类型记录 `logger.info` 或 `logger.warn`，并安全返回成功（避免 webhook 重试风暴）。

- [ ] 数据访问层：
  - [ ] 如果复用 Stripe 事件表：
    - [ ] 在 `src/db/schema.ts` 中为 `stripe_event` 增加 provider 字段（如 `provider: 'stripe' | 'creem'`），并适配相应 Repository。
    - [ ] 将 Repository 抽象为 `PaymentEventRepositoryLike`，内部根据 provider 分支逻辑。
  - [ ] 如果新建 Creem 事件表：
    - [ ] 在 `src/db/schema.ts` 中定义 `creem_event` 表（字段与 `stripe_event` 相近，包含 `eventId`, `type`, `processedAt`, `payload` 等）。
    - [ ] 新增 `src/payment/data-access/creem-event-repository.ts`，实现 `withEventProcessingLock` 等接口。

---

## 6. Billing / Credits 集成点

**目标：** 让 Creem webhook 事件与现有 Billing/Credits 流程对齐，保持业务行为与 Stripe 路径一致。

- [ ] 复用 `src/domain/billing/billing-service.ts` 中的入口方法：
  - [ ] `startSubscriptionCheckout` / `startCreditCheckout`：
    - [ ] 通过 `getPaymentProvider()` 调用对应 Provider（当 `websiteConfig.payment.provider = 'creem'` 时走 Creem）。
  - [ ] `handleRenewal`：
    - [ ] 在 Creem 订阅续费相关事件中调用，逻辑与 Stripe 分支保持一致。
  - [ ] `grantLifetimePlan`：
    - [ ] 在 Creem 对应的一次性付款事件中调用。
- [ ] Credits 侧（`src/credits/services/credit-ledger-service.ts` 等）：
  - [ ] 确认 `addCredits` / `addSubscriptionCredits` / `addLifetimeMonthlyCredits` 接口足够支撑 Creem 事件触发，无需 Provider 感知。
  - [ ] 如有必要，可为 Creem 特有场景新增小的包装方法，但优先复用现有接口。

---

## 7. 测试与文档更新（Phase A 范围）

- [ ] 测试（建议但视时间量级可分批实施）：
  - [ ] 为 `CreemPaymentProvider` 添加单元测试（mock Creem API 调用）：
    - [ ] 成功创建 checkout / credit checkout / portal。
    - [ ] 错误场景（认证失败/参数错误）抛出合理错误。
  - [ ] 为 `paymentProviderFactory` 添加测试：
    - [ ] `websiteConfig.payment.provider = 'creem'` 时返回 Creem 实现。
    - [ ] 未配置/配置错误时抛出预期错误。
  - [ ] 为 `CreemWebhookHandler` 添加测试：
    - [ ] 订阅续费事件触发 `billingService.handleRenewal` 与 Credits 发放。
    - [ ] 一次性支付事件触发 `addCredits`。
    - [ ] 幂等测试：重复同一 `event.id` 只处理一次。
- [ ] 文档：
  - [ ] 更新 `docs/payment-lifecycle.md`：
    - [ ] 增加 “Creem 支付流程（PaymentProvider + /api/webhooks/creem）” 小节，与 Stripe 部分并列。
    - [ ] 明确两条链路在 Payment/Billing/Credits 层的对齐关系。
  - [ ] 更新 `docs/env-and-ops.md` 中 Stripe Webhook 部分，增加一句 Creem Webhook 对应入口说明。
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

> 实施时，可在实现 `CreemWebhookHandler` 和 `CreemPaymentProvider` 前先在 `.codex/plan/creem-payment-integration.md` 下补充一个“Creem metadata 约定”小节，统一规定 `metadata.userId` / `metadata.productType` / `metadata.credits` 等字段的命名与取值范围。

> 本计划仅为 Phase A 的文件/函数级 checklist，执行时请严格遵守现有架构文档与 `.codex/rules` 中的约束，优先复用 Stripe 路径的设计与实现模式。
