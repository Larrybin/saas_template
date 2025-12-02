任务：重构 StripePaymentService，抽取工厂与映射，降低耦合

## 上下文

- 支付 / credits 属于核心领域，基于 Context7（Stripe Node / 支付集成最佳实践）采纳分层架构：
  - 集成层薄（Stripe SDK 适配），领域层干净（billing / credits / 通知）。
  - Webhook 使用官方签名校验，事件解析与领域处理分层。
- 现状：`StripePaymentService` 同时承担依赖组装、Stripe 适配、Webhook 入口、与 Billing/Credits/通知的胶水逻辑，职责偏重。
- 目标：在保持对外行为不变的前提下，
  - 移除 `StripePaymentService` 内部对 env/config、默认依赖的直接创建；
  - 抽出工厂集中读取配置并组装依赖；
  - 抽出 Stripe 事件映射为纯函数模块，简化 Webhook 入口。

> 当前代码状态：已将原先的 `StripePaymentService` 拆分为 `StripePaymentAdapter`（支付入口）、`StripeWebhookHandler`（事件处理）与工厂 `createStripePaymentProviderFromEnv`/`createStripeWebhookHandlerFromEnv`（`src/payment/services/stripe-payment-factory.ts`），并通过 `src/payment/index.ts` / `src/lib/server/stripe-webhook.ts` 暴露。以下任务保留历史语境，后续改动应以现有 Adapter + Factory + WebhookHandler 结构为准。

## 约束

- 对外 HTTP API / Webhook URL、请求/响应结构与错误语义保持兼容。
- Stripe 调用流程（PaymentIntent / Checkout / Subscription / Webhook 事件类型）语义不变。
- 仅调整内部依赖拓扑与模块边界，禁止引入新 Provider 或大规模重写 Billing/Credits 域。
- 重构后需要保持现有测试可通过，并为新抽出的映射模块补充必要单元测试。

## 计划（已执行）

1. 梳理 `StripePaymentService` 调用点与依赖关系：
   - 读取 `src/payment/index.ts` 和 `src/payment/services/__tests__/stripe-payment-service.test.ts`，确认：
     - 生产代码通过 `createStripePaymentProvider` in `src/payment/index.ts` 统一构造 Service；
     - 测试通过 `createService` helper 直接 `new StripePaymentService` 并注入 mock 依赖。
2. 收紧构造依赖并移除默认实现：
   - 将 `StripePaymentServiceDeps` 中的可选依赖（CreditsGateway / NotificationGateway / UserRepository / PaymentRepository / StripeEventRepository / BillingService）改为必填。
   - 构造函数中移除对 `CreditLedgerService` / `DefaultNotificationGateway` / `UserRepository` / `PaymentRepository` / `StripeEventRepository` / `DefaultBillingService` / `isCreditsEnabled` 的直接 `new` / 调用。
3. 新增工厂集中组装与配置：
   - 新建 `src/payment/services/stripe-payment-factory.ts`：
     - `createStripeClientFromSecret`：从 secret key 创建 Stripe client（实现 `StripeClientLike`）。
     - `createStripePaymentProviderFromEnv(env, overrides)`：
       - 从 env（secret key / webhook secret）读取配置，负责错误提示；
       - 构造默认 CreditsGateway / NotificationGateway / UserRepository / PaymentRepository / StripeEventRepository；
       - 创建 `DefaultBillingService`，并在之后注入 `PaymentProvider`；
       - 使用上述依赖构造 `StripePaymentService` 并返回。
4. 更新调用方改用工厂：
   - 修改 `src/payment/index.ts`：
     - 移除对 `Stripe`、`StripePaymentService` 的直接依赖；
     - `createStripePaymentProvider` 改为委托给 `createStripePaymentProviderFromEnv`，传入 `serverEnv` 中的 Stripe 配置和可选 overrides。
5. 抽取 Stripe 映射纯函数模块：
   - 新建 `src/payment/services/stripe-event-mapper.ts`：
     - `mapStripeSubscription` / `mapStripeCheckoutSession` / `mapStripeEvent` 三个纯函数，复用原有逻辑，仅移出类。
   - 更新 `StripePaymentService`：
     - 删除类内部的映射私有方法，改为导入并在 `handleWebhookEvent` 内调用 `mapStripeEvent`。
6. 补充或调整相关测试：
   - 更新 `src/payment/services/__tests__/stripe-payment-service.test.ts`：
     - `createService` helper 现在显式构造所有依赖（creditsGateway / notificationGateway / userRepository / paymentRepository / stripeEventRepository / billingService），并以新必填 deps 形式传入。
   - 使用 Vitest 运行该测试文件，确认行为保持（命令中不再使用 Vitest 不支持的 `--runInBand` 选项）。
7. （可选）更新治理文档说明：
   - 在 `docs/payment-lifecycle.md` / `docs/env-and-ops.md` 中补充：
     - Stripe 配置与默认依赖现由 `stripe-payment-factory` 组装；
     - `StripePaymentService` 主要职责为支付/订阅用例编排与 Webhook 入口；
     - Stripe 事件映射逻辑位于独立的 `stripe-event-mapper` 模块，可单独测试与复用。

## 后续演进方向（指向方案 2）

- 进一步将 `StripePaymentService` 收窄为「StripePaymentAdapter」，仅负责 Stripe 调用与类型映射；
- 强化 Billing/Credits 领域服务作为 orchestrator，统一依赖 PaymentProvider 抽象；
- 将 Webhook 入口封装为独立的 `StripeWebhookHandler`，实现「Webhook 适配层 → 领域事件处理层」的清晰分层。
