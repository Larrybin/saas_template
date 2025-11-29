任务：支付域 Hexagonal 重构（方案 2：PaymentAdapter + WebhookHandler + DomainService）

## 背景与目标

- 背景：
  - 当前已有 `PaymentProvider` 接口和 `DefaultBillingService` 领域服务；
  - 方案 1 已完成：`StripePaymentService` 抽出工厂与事件映射，内部不再读 env，职责收敛；
  - 但 Stripe 集成仍同时承载支付适配和部分 Webhook/Billing 协调逻辑。
- 目标：
  - 按 Hexagonal/DDD 最佳实践重构支付域：
    - 支付适配层（StripePaymentAdapter）只关心 Stripe API 调用；
    - 领域层（Billing/Credits）只关心业务规则与用例；
    - Webhook 处理单独抽成适配器（StripeWebhookHandler），负责将 Stripe 事件转换为领域调用。
  - 保持对外 HTTP / Webhook 行为与错误语义不变，尽量复用现有 `DefaultBillingService`。

## 目标架构（高层设计）

- 端口（Ports）
  - `PaymentProvider`（已有，`src/payment/types.ts`）：
    - 专注于“主动支付调用”：`createCheckout` / `createCreditCheckout` / `createCustomerPortal` / `getSubscriptions`。
    - 理想终态：不再包含 Webhook 处理职责。
  - `BillingService`（已有，`src/domain/billing/billing-service.ts`）：
    - 面向上层用例（API/Actions）的计费/credits 领域服务。

- 适配器（Adapters）
  - `StripePaymentAdapter`（新 / 从 `StripePaymentService` 演进）：
    - 位置：`src/payment/services/stripe-payment-adapter.ts`。
    - 实现 `PaymentProvider` 的“发起支付”方法：
      - `createCheckout` / `createCreditCheckout` / `createCustomerPortal` / `getSubscriptions`。
    - 依赖：
      - `StripeClientLike`、`UserRepositoryLike`、`PaymentRepositoryLike`、日志等。
    - 不再依赖：
      - `CreditsGateway`、`NotificationGateway`、`BillingService`、`StripeEventRepository`、Webhook 相关逻辑。
  - `StripeWebhookHandler`（新）：
    - 位置：`src/payment/services/stripe-webhook-handler.ts`。
    - 职责：
      - 使用 `stripeClient.webhooks.constructEvent` 做签名校验；
      - 使用 `mapStripeEvent` 将 `Stripe.Event` → `StripeWebhookEventLike`；
      - 通过 `StripeEventRepository.withEventProcessingLock` 做事件幂等/加锁；
      - 调用领域服务/仓储：
        - `BillingService`（`handleRenewal` / `grantLifetimePlan` 等）；
        - `CreditsGateway`；
        - `NotificationGateway`；
        - `PaymentRepository`。
    - 对外暴露：
      - `handleStripeWebhook(payload: string, signature: string): Promise<void>`。

- 领域服务（Domain Services）
  - `DefaultBillingService`（已有）：
    - 继续负责：
      - `startSubscriptionCheckout` / `startCreditCheckout`（通过 `PaymentProvider` 发起 Stripe 支付）；
      - `handleRenewal` / `grantLifetimePlan`（credits 发放、终身会员落库等）。
    - 依赖：
      - `PaymentProvider`、`CreditsGateway`、`PlanPolicy`、`creditsEnabled`、`UserLifetimeMembershipRepository`。
  - 可选：后续可考虑细化出专门承接 Webhook 续费/终身逻辑的窄领域服务（非本轮必做）。

## 全局组合关系

- `src/payment/index.ts`（支付组合根）
  - `createStripePaymentProvider`：
    - 实际返回 `StripePaymentAdapter` 实例（实现 `PaymentProvider`）。
  - `getPaymentProvider`：
    - 对 `DefaultBillingService` 等领域层暴露支付端口。
  - `handleWebhookEvent(payload, signature)`：
    - 改为委托 `StripeWebhookHandler`：
      - 使用工厂/组装根创建 `StripeWebhookHandler` 所需依赖：
        - `stripeClient`（与 PaymentAdapter 共享）、`stripeEventRepository`、`paymentRepository`、`notificationGateway`、`CreditsGateway`、`BillingService`。
      - 调用 `handler.handleStripeWebhook(payload, signature)`。

- `src/lib/server/billing-service.ts`
  - 继续作为统一的 `BillingService` 工厂：
    - 使用 `getPaymentProvider()`（即 `StripePaymentAdapter`）作为 `DefaultBillingService` 的 `paymentProvider` 依赖。
  - Webhook 用例同样从这里获取 `BillingService` 实例，传入 `StripeWebhookHandler` 使用。

## 迁移步骤（执行路线）

> 注意：为降低风险，建议分两阶段进行：先“逻辑拆分/委托”，再“接口清理（移除 PaymentProvider.handleWebhookEvent）”。

### 阶段 1：拆出 WebhookHandler，保持 PaymentProvider 接口不变

1. 新建 `StripeWebhookHandler`
   - 文件：`src/payment/services/stripe-webhook-handler.ts`。
   - 从当前 `StripePaymentService.handleWebhookEvent` 中提炼：
     - 把事件处理部分（`withEventProcessingLock` 内部对 `handleStripeWebhookEvent` 的调用及依赖注入）迁移到 `StripeWebhookHandler`；
     - 保证使用现有的 `handleStripeWebhookEvent` 纯函数和 `mapStripeEvent` 逻辑。
   - 依赖注入：
     - `stripeClient`（for `constructEvent`）、`stripeWebhookSecret`；
     - `stripeEventRepository`、`paymentRepository`；
     - `creditsGateway`、`notificationGateway`、`billingService`；
     - `logger`。

2. 精简 `StripePaymentService.handleWebhookEvent` 为委托
   - 保持实现 `PaymentProvider.handleWebhookEvent` 以兼容现有接口。
   - 内部仅负责：
     - 使用已有依赖构造/持有 `StripeWebhookHandler`；
     - 将 `payload`/`signature` 转发给 `handler.handleStripeWebhook`。

3. 在组合根中使用 WebhookHandler
   - 可选优化：
     - 在 `src/payment/index.ts` 中，`handleWebhookEvent` 不再通过 `getPaymentProvider()`，而是直接构造/复用一个 `StripeWebhookHandler` 实例；
     - 此时 `StripePaymentService.handleWebhookEvent` 仍存在，但不再被生产路径使用，为后续接口清理做准备。

### 阶段 2：收缩 PaymentAdapter，清理接口职责

4. 将 `StripePaymentService` 重命名/演进为 `StripePaymentAdapter`
   - 文件重命名：`stripe-payment-service.ts` → `stripe-payment-adapter.ts`（或新增 Adapter 并逐步迁移）。
   - 类职责收缩：
     - 保留：`createCheckout` / `createCreditCheckout` / `createCustomerPortal` / `getSubscriptions`；
     - 移除：任何与 Webhook 处理、`StripeEventRepository`、`CreditsGateway`、`NotificationGateway`、`BillingService` 直接相关的字段。
   - 对应工厂（`stripe-payment-factory.ts`）调整：
     - 仅负责创建 `StripePaymentAdapter` + 其直接依赖；
     - 不再在该工厂中创建 `DefaultBillingService`（由 `src/lib/server/billing-service.ts` 统一负责）。

5. 将 Webhook 完全迁移到 `StripeWebhookHandler`
   - 确保生产路径中：
     - 所有 Webhook 请求都通过 `StripeWebhookHandler.handleStripeWebhook` 执行；
     - 不再依赖 `PaymentProvider.handleWebhookEvent`。
   - 更新：
     - `src/payment/index.ts` 的 `handleWebhookEvent`；
     - 如有其他直接调用 `PaymentProvider.handleWebhookEvent` 的地方，统一迁移到新的 handler 或包装函数。

6. 清理 `PaymentProvider` 接口职责（可选终态）
   - 当所有调用点迁移完成后：
     - 从 `src/payment/types.ts` 的 `PaymentProvider` 中移除 `handleWebhookEvent`；
     - 可选：引入单独的 `PaymentWebhookHandler` 接口，由 `StripeWebhookHandler` 实现。
   - 更新：
     - 所有实现 `PaymentProvider` 的类/测试；
     - 文档中对 PaymentProvider 的职责说明（如 `docs/payment-lifecycle.md`）。

## 验收与风险控制

- 验收点：
  - 所有现有与支付/credits 相关的单元测试、集成测试、E2E 流程保持通过；
  - Webhook 行为（事件类型、重复事件跳过、错误传播）在测试中与重构前一致；
  - `DefaultBillingService` 的对外行为不变。
- 风险控制：
  - 优先实现阶段 1，在不改接口的前提下完成 WebhookHandler 抽取；
  - 为 `StripeWebhookHandler` 和 `StripePaymentAdapter` 分别补充针对性单元测试；
  - 在阶段 2 清理接口前，确认没有生产路径依赖 `PaymentProvider.handleWebhookEvent`。

