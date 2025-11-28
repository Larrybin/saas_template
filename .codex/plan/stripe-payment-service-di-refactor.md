---
title: StripePaymentService 依赖注入与组合根重构
description: 将 StripePaymentService 从 env/config 与依赖构造中解耦，集中到 payment 组合根与工厂，预留多 Provider、多租户扩展点。
---

## 背景与问题

- 当前 `StripePaymentService`（`src/payment/services/stripe-payment-service.ts`）在构造函数中直接读取 `serverEnv.stripeSecretKey` 与 `serverEnv.stripeWebhookSecret`。
- 同一个构造器内部还负责：
  - `new Stripe(apiKey)` 创建 Stripe client。
  - `new CreditLedgerService()`、`new DefaultNotificationGateway()`、`new UserRepository()`、`new PaymentRepository()`、`new StripeEventRepository()`。
  - `new StripeCheckoutService(...)`、`new CustomerPortalService(...)`、`new SubscriptionQueryService(...)`。
  - `new DefaultBillingService({ paymentProvider: this, ... })`。
- 这导致：
  - 领域层（Payment 模块视为领域层的一部分）直接读取 env/config，违反 `.codex/rules/domain-layer-and-usecase-design-best-practices.md` 中「Domain 不直接读 env/config」的约束。
  - PaymentProvider 与具体实现（Stripe）强耦合，未来引入第二个 Provider（例如 Creem）以及多租户（每 workspace / project 独立 Stripe key/secret）时代价高。
  - 测试时虽然可以通过 deps 注入替身，但默认路径仍然强依赖 env，组合逻辑分散。

## 设计决策（已在构思阶段确认）

1. **统一 PaymentProvider 接口，上层不感知具体实现**
   - `BillingService`、Usecase、Route 等上层只依赖 `PaymentProvider` 接口（当前已存在），不直接引用 `StripePaymentService` 或将来 `CreemPaymentService`。
   - Provider 选择逻辑集中在单一组合根（`src/payment/index.ts`），允许使用简单的 `if (websiteConfig.payment.provider === 'stripe' | 'creem')` 分支。

2. **env/config 读取集中在组合根 / 工厂，领域服务纯依赖注入**
   - Stripe key 与 webhook secret 从 `serverEnv` 读取的逻辑迁移到组合根工厂，例如 `createStripePaymentProvider()`。
   - 工厂负责：
     - 读取并校验 `serverEnv.stripeSecretKey` / `serverEnv.stripeWebhookSecret`。
     - 基于 key `new Stripe(apiKey)` 构建 `StripeClientLike`。
     - 将 `stripeClient` 与 `webhookSecret` 作为依赖注入给 `StripePaymentService`。
   - `StripePaymentService` 不再直接读 env，只消费注入的依赖。

3. **多 Provider 与多租户扩展策略**
   - 硬约束：
     - `PaymentProvider` 作为稳定接口对上层暴露。
     - Provider 选择通过 `websiteConfig.payment.provider` 等配置集中判断，避免各处 if。
   - 软约束 / 预留点：
     - 在组合根定义 `createStripePaymentProvider(overrides?: { stripeSecretKey?: string; webhookSecret?: string })` 之类的工厂签名，为未来「按 workspace 注入不同 config」预留接口。
     - 当前仍使用全局 `serverEnv` 加载 key/secret，未来仅需在更上层根据 workspace/project 配置构造 overrides。

4. **对外 API 保持稳定**
   - `src/payment/index.ts` 对外导出函数（`getPaymentProvider`、`createCheckout`、`createCreditCheckout`、`createCustomerPortal`、`handleWebhookEvent`、`getSubscriptions`）的签名与调用方式保持不变。
   - 本轮重构仅调整内部 wiring 与依赖注入，不修改 Route/Action/Usecase 的调用约定。

## 执行步骤

1. **重构 StripePaymentService 构造函数为纯依赖注入**
   - 调整 `StripePaymentServiceDeps`：
     - 将 `stripeClient`、`webhookSecret` 从可选收紧为必需字段，生产路径必须显式注入。
     - 其它依赖（`creditsGateway`、`notificationGateway`、`userRepository`、`paymentRepository`、`stripeEventRepository`、`billingService`）暂时保留默认构造逻辑，以控制改动范围。
   - 删除对 `serverEnv` 的依赖：
     - 移除 `serverEnv` import 与构造函数中对 `stripeSecretKey` / `stripeWebhookSecret` 的读取。
   - 在构造函数中校验依赖：
     - 如果缺少 `stripeClient` 或 `webhookSecret`，立即抛出错误（视为组合根 wiring 错误，而非业务错误）。

2. **在 payment 组合根集中 env 读取与 Provider 选择**
   - 在 `src/payment/index.ts` 中：
     - 引入 `serverEnv` 与 `Stripe`。
     - 提炼 `createStripePaymentProvider(overrides?: { stripeSecretKey?: string; stripeWebhookSecret?: string })`：
       - 从 `overrides` 或 `serverEnv` 中解析 key/secret，并在缺失时抛出与现有文档一致的错误信息。
       - 创建 `stripeClient` 并注入到 `StripePaymentService`。
     - 在 `initializePaymentProvider` 中：
       - 当 `websiteConfig.payment.provider === 'stripe'` 时，调用 `createStripePaymentProvider()`。
       - 为未来 `creem` 分支预留占位（目前可直接抛 `Unsupported payment provider: creem` 或 TODO）。

3. **为多租户扩展保留接口形态（本轮不实现具体 workspace 逻辑）**
   - 通过 `createStripePaymentProvider(overrides)` 的签名，为未来从 workspace/project 配置中注入 tenant 级 key/secret 提供入口。
   - 上层在多租户演进时，只需在 workspace 上下文中解析配置并调用该工厂，无需修改 Payment domain 与 Billing 逻辑。

4. **更新与补充测试**
   - 调整 `src/payment/services/__tests__/stripe-payment-service.test.ts`：
     - 所有 `new StripePaymentService()` 调用改为显式传入 mock 的 `stripeClient` 与 `webhookSecret`。
   - 新增或扩展针对组合根的测试：
     - 验证 `initializePaymentProvider` 在 env 配置完整时能成功返回 Stripe 实现。
     - 验证 env 缺失时抛出的错误与文档约定一致。

5. **同步更新文档**
   - 更新 `docs/payment-lifecycle.md`：
     - 描述从「StripePaymentService 构造器读取 env」调整为「组合根工厂从 env/config 读取并注入」。
   - 更新 `docs/env-and-ops.md` 中 Stripe 小节：
     - 将「构造 StripePaymentService 时校验 STRIPE_WEBHOOK_SECRET」替换为「初始化 payment provider（组合根）时校验」。

## 验证要点

- 单元测试全部通过，特别是 Payment/Billing 相关测试。
- 本地或测试环境下，`STRIPE_SECRET_KEY` 或 `STRIPE_WEBHOOK_SECRET` 缺失时，错误日志与文档描述的行为一致。
- Route / Actions / Usecase 对 Payment 的调用点无需改动即可通过编译与测试。

