# Payment 生命周期与边界说明

> 本文聚焦 Payment / Billing / Stripe/Creem（Phase A） Webhook 与 Credits 的交互关系，以及它们与 UI、Domain、外部服务之间的边界。  
> 架构总览请先参考：`docs/architecture-overview.md` 与 `docs/feature-modules.md`。

---

## 1. 背景与职责

Payment 模块承担的核心职责：

- 封装 Stripe 支付能力（订阅 / 一次性 / Credits 套餐）以及 Phase A 下的 Creem Provider（REST-only，非生产环境）。  
- 为 UI / Actions / Webhooks 提供统一的领域服务接口。  
- 驱动本地 Payment 状态与 Credits/Billing 的联动（如订阅续费发放积分、Credits 套餐购买等）。

边界约束：

- 只有 Payment 模块可以直接依赖 Stripe SDK / 调用 Creem REST API；其他模块（UI、domain、usecases）只能通过 Payment 暴露的接口访问支付能力。  
- 对积分/订阅的业务决策（如续费是否发放积分、Lifetime 月度发放规则）由 Billing + Credits 共同决定，Payment 只负责触发与持久化事件。

---

## 1.1 Creem 官方文档索引（Phase A 相关）

Creem 集成在 Phase A 中仅覆盖标准 Checkout + Webhook 流程，所有字段含义和事件语义以上述官方文档为唯一权威来源：

- Checkout 标准集成流程与 Test Mode 说明：<https://docs.creem.io/checkout-flow>  
- Webhooks 与事件类型（如 `checkout.completed` / 订阅相关事件）：<https://docs.creem.io/learn/webhooks/introduction>  
- Return URL 与签名校验（如何验证 Creem 返回 URL 参数）：参见官方文档 “Return URLs › How to verify Creem signature?” 章节。  

在本模板的 Phase A 范围内，**Creem Return URL 仅用于 UX 展示与重定向体验**：

- 所有「是否已经付款」「是否授予订阅 / Lifetime 权限」「是否写入账本」等事实，只以 Webhook 事件（`checkout.completed` / `subscription.*`）为唯一依据；  
- 我们不会在任何地方基于 Creem Return URL 的查询参数直接授予权限或修改计费状态；  
- 如未来需要在服务端消费 Return URL 参数（例如做幂等校验或低风险的 UX 行为），必须参考官方 “How to verify Creem signature?” 实现签名校验，并继续遵守“Webhook 才是事实来源”的约束。

本文件、`.codex/plan/creem-payment-integration.md` 与 `docs/env-and-ops.md` 仅定义本模板内部的架构与约定；如与官方文档存在冲突，以官方文档为裁决，内部实现需跟随更新。

---

## 2. 核心模块与文件

### 2.1 Provider 与服务

- `src/payment/index.ts`
  - 提供对外入口函数：`getPaymentProvider`, `createCheckout`, `createCreditCheckout`, `createCustomerPortal`, `getSubscriptions` 等（不再承担 Webhook 入口职责）。  
  - 通过全局 `paymentProviderFactory`（`DefaultPaymentProviderFactory`，定义于 `src/payment/provider-factory.ts`）获取当前 `PaymentProvider` 实例：
    - `DefaultPaymentProviderFactory` 会在首次选择 `'stripe'` Provider 时，从 `serverEnv` 读取 Stripe 相关配置（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`），并使用 `createStripePaymentProviderFromEnv` 组装默认的 `StripePaymentAdapter`（懒初始化，避免在未使用 Stripe 时强制依赖其 env）；  
    - 当 `providerId === 'creem'` 且 `NODE_ENV !== 'production'` 时，`DefaultPaymentProviderFactory` 会通过 `createCreemPaymentProviderFromEnv` 组装 `CreemPaymentProvider`，该 Provider 基于 `CreemClient` 的 REST 调用与 `websiteConfig.payment.creem` 下的映射配置（`subscriptionProducts` / `creditProducts`）；在生产环境中，选择 `'creem'` 会抛出 `CREEM_PHASE_GATE_ERROR_MESSAGE`，明确提示 Creem 仍处于 Phase A，禁止在生产启用，并引导查看 `.codex/plan/creem-payment-integration.md` 与 `docs/governance-index.md`。  
    - `getPaymentProvider` 会根据 `websiteConfig.payment.provider` 组装 `PaymentContext`（目前仅包含 `providerId`），并调用 `paymentProviderFactory.getProvider(ctx)` 选择具体 Provider，默认值为 `'stripe'`。

- `src/payment/services/stripe-payment-adapter.ts`
  - `StripePaymentAdapter`：Stripe 场景下的支付适配器，职责包括：
    - 持有由外部注入的 Stripe client（不直接读取 env/config）。  
    - 接受注入 `UserRepository`、`PaymentRepository` 等依赖（具体默认实现由工厂/组合根提供）。  
    - 封装：
      - `createCheckout` / `createCreditCheckout`（创建 checkout session）。  
      - `createCustomerPortal`（customer portal session）。  
      - `getSubscriptions`（从本地状态查询订阅）。

- `src/lib/server/stripe-webhook.ts`
  - `handleStripeWebhook(payload, signature)`：Stripe Webhook 组合根，职责包括：
    - 从 `serverEnv` 读取 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`；  
    - 通过 `createStripeWebhookHandlerFromEnv` 组装 `StripeWebhookHandler` 所需的 Stripe client / 仓储 / 网关；  
    - 通过 `getBillingService()` 获取 Billing 领域服务（按窄接口 `BillingRenewalPort` 使用）；  
    - 调用 `handler.handleWebhookEvent(payload, signature)` 完成验证、幂等与业务协作。

### 2.2 数据访问与仓储

- `src/payment/data-access/payment-repository.ts`  
  - 负责 `payment` 表读写（记录 checkout / subscription / payment 相关状态）。

- `src/payment/data-access/stripe-event-repository.ts`  
  - 负责 `stripe_event` 表与事件幂等处理（通过 “withEventProcessingLock” 确保每个 event 只处理一次）。

- `src/payment/data-access/user-repository.ts`  
  - Payment 上下文中对用户信息的访问封装。

### 2.3 Creem Provider 与 Webhook（Phase A）

- `src/payment/services/creem-payment-adapter.ts`
  - `CreemPaymentProvider`：Creem 场景下的支付适配器，当前处于 Phase A，能力范围与约束为：
    - `createCheckout` / `createCreditCheckout`：通过 `websiteConfig.payment.creem.subscriptionProducts[planId][priceId]` 与 `creditProducts[packageId]` 映射到 Creem 的 `product_id`，再调用 `CreemClient.createCheckout`（仅使用 REST API，不接入官方 TS SDK，详见 <https://docs.creem.io>）；  
    - `createCustomerPortal`：Phase A 仅返回 Creem 托管入口 URL（例如 `https://creem.io/my-orders/login`），本系统不承载卡信息管理 UI；  
    - `getSubscriptions`：与 Stripe 分支一致，复用 `SubscriptionQueryService + PaymentRepository`，从本地订阅/支付表读数据，不直接调用 Creem 订阅列表 API。  
  - 统一 metadata 协议：通过 `buildCreemCheckoutMetadata` 生成/透传 `request_id` 与业务 `metadata`，至少包含 `user_id` / `product_type ('subscription' | 'credits')` / `credits?` / `provider_id: 'creem'` / `request_id`，并写入所有 `createCheckout` 请求。

- `src/payment/services/creem-client.ts`
  - `CreemClient`：对 Creem REST API 的最小封装，依赖 `serverEnv.creemApiKey` / `serverEnv.creemApiUrl`（即 `CREEM_API_KEY` / `CREEM_API_URL`），当前仅实现 `/checkouts` 创建接口。  
  - 当缺少上述环境变量或 Creem 返回 401/403 时，会抛出 `DomainError`，错误码为 `CREEM_PROVIDER_MISCONFIGURED`，提示 Provider 配置错误，不会静默退化为其它 Provider；对不同 HTTP 状态与网络异常会使用：  
    - `CREEM_CHECKOUT_INVALID_REQUEST`：代表我们构造的 checkout 请求参数不合法（典型为 400/422）。  
    - `CREEM_CHECKOUT_DOWNSTREAM_ERROR`：代表 Creem 侧下游服务异常（典型为 5xx 或未细分的错误）。  
    - `CREEM_CHECKOUT_NETWORK_ERROR`：代表调用 Creem checkout API 时的网络或传输层异常（如超时、连接失败）。

- `src/lib/server/creem-webhook.ts` + `src/payment/services/creem-webhook-handler.ts`
  - Webhook 入口 `/api/webhooks/creem` 调用 `handleCreemWebhook(payload, headers)`，使用 `CREEM_WEBHOOK_SECRET`（`serverEnv.creemWebhookSecret`）与 `creem-signature` 头进行验签，失败时抛出 `PAYMENT_SECURITY_VIOLATION`。  
  - 通过 `CreemEventRepository.withEventProcessingLock('creem', ...)` 统一处理 Creem 事件幂等，并委托 `CreemWebhookHandler`：  
    - 处理 `checkout.completed`：根据 metadata 中的 `product_type` / `credits` 与 customer/product 信息，写入一次性付款记录并通过 `CreditsGateway` 发放积分；  
    - 处理 `subscription.*`：将 Creem 订阅状态映射为内部 `PaymentStatus`，更新本地订阅记录并在续费时调用 Billing 域的 `handleRenewal`。  
  - Webhook 仅消费 Provider 侧约定的 metadata 字段（`user_id` / `product_type` / `credits`），并依赖事件仓储表做幂等，与 Stripe Webhook 路径保持对称。

### 2.3 Billing 域与 Credits 交互

  - `src/domain/billing/billing-service.ts`（`DefaultBillingService`）
  - 负责 Payment 与 Credits/Billing 策略之间的协调：
   - `startSubscriptionCheckout`：校验 plan/price 合法性后委托 `PaymentProvider`（默认 `StripePaymentAdapter`）创建 checkout。  
    - `startCreditCheckout`：为积分套餐创建 checkout session。  
    - `handleRenewal`：订阅续费时，根据 plan/price 与 credits 配置决定是否调用 `CreditsGateway.addSubscriptionCredits`。  
    - `grantLifetimePlan`：lifetime 计划购买时，处理月度积分发放与 lifetime membership 记录。
  - 依赖的核心能力：
    - `CreditsGateway`：通常为 `CreditLedgerService`，负责实际积分发放。  
    - `PlanPolicy`：对 `websiteConfig.price.plans`/`credits` 的抽象视图，用于解析计划与积分策略。
    - `MembershipService`：Membership 域服务，用于在 lifetime 购买成功时统一落库/更新终身会员记录。

---

## 3. 典型生命周期：订阅与 Credits 套餐

### 3.1 订阅购买与续费

1. **用户发起订阅**：
   - UI（例如 Pricing 页面或 Settings Billing 页）调用 `createCheckoutAction`（`src/actions/create-checkout-session.ts`）。  
   - Action 通过 `userActionClient` 注入当前用户，校验 `planId` / `priceId` / `metadata`，并构造成功/取消回调 URL。

2. **创建 checkout session**：
   - Action 调用 `getBillingService().startSubscriptionCheckout(...)`。  
   - `DefaultBillingService.startSubscriptionCheckout`：
     - 使用 `PlanPolicy` 检查 plan/price 是否存在且未禁用。  
     - 调用 `PaymentProvider.createCheckout`（默认 `StripePaymentAdapter`）创建 checkout session。  
   - 结果通过 Action 返回前端，前端重定向到 Stripe Checkout。

3. **续费与积分发放**：
   - Stripe 在订阅续费时触发相关 webhook 事件，POST 到 `/api/webhooks/stripe`。  
   - API Route：`src/app/api/webhooks/stripe/route.ts`：
     - 使用 `createLoggerFromHeaders` 建立 request logger；  
     - 读取 payload + signature，检查缺失条件（缺 payload/签名）返回 400；  
     - 调用 `handleStripeWebhook(payload, signature)`。
   - Webhook 处理由 `StripeWebhookHandler` 承担：
     - 通过 `stripe.webhooks.constructEvent` 验证并解析事件。  
     - 使用 `StripeEventRepository.withEventProcessingLock` 确保幂等处理。  
     - 委托 `handleStripeWebhookEvent`，其中会：
       - 根据事件类型更新 `payment` 状态；  
       - 对订阅续费事件调用 Billing 域的 `handleRenewal`，进而通过 CreditsGateway 发放周期性积分。

### 3.2 Credits 套餐购买

1. **前端发起购买请求**：
   - UI（如 `CreditPackages` 组件）使用 `CreditCheckoutButton`（`src/components/settings/credits/credit-checkout-button.tsx`）触发购买。  
   - Button 客户端逻辑：
     - 透传 `userId` / `packageId` / `priceId` / 自定义 metadata。  
     - 调用 `createCreditCheckoutSession`（`src/actions/create-credit-checkout-session.ts`）的 server action。  
     - 根据结果跳转到 Stripe Checkout，或通过 `getDomainErrorMessage` + registry 显示错误 toast。

2. **服务端创建 Credits checkout session**：
   - Action 校验输入，解析 package 配置（priceId/amount/expires）。  
   - 调用 `PaymentProvider.createCreditCheckout` 创建 checkout session，并返回 URL。

3. **支付完成后的处理**：
   - Stripe 同样通过 webhook 事件通知系统。  
   - Webhook handler 中，根据事件类型识别 Credits 套餐支付成功，并调用 Credits 服务（例如通过 Billing 或直接使用 `CreditsGateway`）发放对应积分。

---

## 4. 错误模型与 UI 行为

### 4.1 服务端错误与错误码

- 错误码声明：`src/lib/server/error-codes.ts`
  - Payment 相关典型错误码：
    - `PAYMENT_SECURITY_VIOLATION`：支付安全校验失败（例如签名/密钥/幂等性异常）。  
    - `CREEM_PROVIDER_MISCONFIGURED`：Creem Provider 配置错误（env 或 plan/package 映射缺失、API key 无效等）。  
    - `CREEM_CHECKOUT_INVALID_REQUEST` / `CREEM_CHECKOUT_DOWNSTREAM_ERROR` / `CREEM_CHECKOUT_NETWORK_ERROR`：Creem checkout 请求参数错误、下游服务异常或网络错误。  
  - 详情见 `docs/error-codes.md`中的 Billing / Payment 区域。

- Webhook Route：`src/app/api/webhooks/stripe/route.ts`
  - 使用 `DomainError` 捕获 Payment/Billing 域错误：  
    - `PAYMENT_SECURITY_VIOLATION` → 返回 400 + `{ error, code, retryable }`。  
    - 其他 DomainError → 400/500 视 `retryable` 而定。  
  - 对未知错误统一返回：  
    - `{ success: false, error: 'Webhook handler failed', code: 'UNEXPECTED_ERROR', retryable: true }`。

### 4.2 前端错误消费（Payment 相关）

- 统一错误文案映射：`src/lib/domain-error-utils.ts`
  - `PaymentSecurityViolation` 对应 i18n key：`Dashboard.settings.credits.packages.purchaseFailed`。

- 错误 UI 策略：`src/lib/domain-error-ui-registry.ts`
  - Payment 相关策略：
    - `PAYMENT_SECURITY_VIOLATION`：`severity: 'error'`, `source: 'payment'`, `defaultFallbackMessage: 'Payment security check failed'`。
  - 组件通过 `getErrorUiStrategy` + `getDomainErrorMessage` 组合得到最终提示文案。

- 典型消费点：`CreditCheckoutButton`
  - 在创建 Credits checkout session 失败时：
    - 拿到 envelope 中的 `code`；  
    - 使用 `getErrorUiStrategy` & `getDomainErrorMessage` 生成 message；  
    - 通过 `toast.error(message)` 提示用户；  
    - 不在按钮内部维护错误码分支（如 `if (code === ...)`），避免散落逻辑。

更多关于错误模型和 UI 行为的规范与示例，见 `docs/error-logging.md`。

---

## 5. 边界与扩展点

### 5.1 与 Credits 的边界

- Payment 不直接修改 Credits 账本表，只通过：
  - Billing 域（`DefaultBillingService`）调用 `CreditsGateway`（`CreditLedgerService`）发放积分。  
  - 或在 Webhook handler 中显式调用 Credits 的服务入口（如有特殊场景）。

- Credits 的生命周期与策略详见：`docs/credits-lifecycle.md`。

### 5.2 与 UI / Actions / API 的边界

- UI 与 Payment 的交互路径：
  - Server Actions：例如 `create-checkout-session` / `create-credit-checkout-session` / `create-customer-portal-session`。  
  - API Routes：如 `/api/webhooks/stripe`。

- UI 不直接依赖 Stripe SDK，也不直接操作 `payment` / `stripe_event` 表。

### 5.3 扩展/接入新的支付场景

在保持现有架构的前提下，新增支付场景时建议遵循：

- 新的 checkout 流程：
  - 在 Payment 域新增对应的 service 方法或扩展 `PaymentProvider` 接口。  
  - 通过 Action/API Route 封装网络与授权细节。  
  - 在 UI 中使用一个小的按钮组件或 Hook，处理 loading 状态与错误 UI（通过 registry + Hook）。

- 新的错误码：
  - 按本项目错误码工作流：`ErrorCodes` → `docs/error-codes.md` → `DOMAIN_ERROR_MESSAGES` → `domain-error-ui-registry` → 领域 Hook/组件。  

通过上述边界与约定，可以在不破坏现有 Payment / Billing / Credits 关系的前提下，逐步扩展更多支付能力。
