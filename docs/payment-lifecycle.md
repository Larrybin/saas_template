# Payment 生命周期与边界说明

> 本文聚焦 Payment / Billing / Stripe Webhook 与 Credits 的交互关系，以及它们与 UI、Domain、外部服务之间的边界。  
> 架构总览请先参考：`docs/architecture-overview.md` 与 `docs/feature-modules.md`。

---

## 1. 背景与职责

Payment 模块承担的核心职责：

- 封装 Stripe 支付能力（订阅 / 一次性 / Credits 套餐）。  
- 为 UI / Actions / Webhooks 提供统一的领域服务接口。  
- 驱动本地 Payment 状态与 Credits/Billing 的联动（如订阅续费发放积分、Credits 套餐购买等）。

边界约束：

- 只有 Payment 模块可以直接依赖 Stripe SDK；其他模块（UI、domain、usecases）只能通过 Payment 暴露的接口访问支付能力。  
- 对积分/订阅的业务决策（如续费是否发放积分、Lifetime 月度发放规则）由 Billing + Credits 共同决定，Payment 只负责触发与持久化事件。

---

## 2. 核心模块与文件

### 2.1 Provider 与服务

- `src/payment/index.ts`
  - 提供对外入口函数：`getPaymentProvider`, `createCheckout`, `createCreditCheckout`, `createCustomerPortal`, `handleWebhookEvent`, `getSubscriptions` 等。  
  - 默认使用 `StripePaymentAdapter` 作为 `PaymentProvider` 实现，由该模块从 `serverEnv` 读取 Stripe 配置并组装依赖。

- `src/payment/services/stripe-payment-adapter.ts`
  - `StripePaymentAdapter`：Stripe 场景下的支付适配器，职责包括：
    - 持有由外部注入的 Stripe client 与 webhook secret（不直接读取 env/config）。  
    - 接受注入 `CreditsGateway`、`NotificationGateway`、`UserRepository`、`PaymentRepository`、`StripeEventRepository` 等依赖（具体默认实现由工厂/组合根提供）。  
    - 封装：
      - `createCheckout` / `createCreditCheckout`（创建 checkout session）。  
      - `createCustomerPortal`（customer portal session）。  
      - `getSubscriptions`（从本地状态查询订阅）。  
      - `handleWebhookEvent`（当前版本中仍通过内部委托调用 `StripeWebhookHandler`，后续可进一步从 `PaymentProvider` 接口中下沉该职责）。

### 2.2 数据访问与仓储

- `src/payment/data-access/payment-repository.ts`  
  - 负责 `payment` 表读写（记录 checkout / subscription / payment 相关状态）。

- `src/payment/data-access/stripe-event-repository.ts`  
  - 负责 `stripe_event` 表与事件幂等处理（通过 “withEventProcessingLock” 确保每个 event 只处理一次）。

- `src/payment/data-access/user-repository.ts`  
  - Payment 上下文中对用户信息的访问封装。

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
     - 调用 `handleWebhookEvent(payload, signature)`。
   - Webhook 处理由 `StripeWebhookHandler` 承担（当前通过 `StripePaymentAdapter.handleWebhookEvent` 委托实现，后续可进一步在组合根中直接使用 Handler）：
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
