# 任务：Billing ↔ Membership 解耦 & Stripe Factory 收敛（方案 1）

## 一、目标与范围

- 消除 `BillingService`（domain）对 `src/payment/data-access/user-lifetime-membership-repository.ts` 的直接依赖，遵守依赖倒置（DIP）。
- 在 `src/domain/membership` 中抽象 `LifetimeMembershipRepository` 接口，仅暴露终身会员需要的能力。
- 收缩 `src/payment/services/stripe-payment-factory.ts` 职责，让 Billing 组合根统一迁移到 `src/lib/server/billing-service.ts`，并为 Webhook 提供窄接口 `BillingRenewalPort`。
- 保持对外行为与 HTTP / Actions / 测试语义不变。

## 二、设计选型（方案 1 概要）

1. 新建领域模块 `src/domain/membership`：
   - 定义 `LifetimeMembershipRecord` 类型和 `LifetimeMembershipRepository` 接口。
   - 不引入新的 `MembershipService`，本轮只做仓储接口抽象。
2. Billing 与 Membership 关系：
   - `DefaultBillingService` 依赖 `LifetimeMembershipRepository` 接口，而不是具体 Drizzle 仓储实现。
   - 对外继续导出 `BillingService`，并新增一个仅包含续费/终身发放的窄接口 `BillingRenewalPort`。
3. Webhook 与 Billing 关系：
   - `StripeWebhookHandler` 依赖 `BillingRenewalPort`，不依赖具体实现类。
   - Webhook 上层组合根从 `getBillingService()` 获取实例，以 `BillingRenewalPort` 形态注入。
4. Stripe Factory 收敛：
   - `stripe-payment-factory.ts` 专注于 Stripe client + payment/stripeEvent 仓储 + 通知网关 + credits gateway 构建。
   - BillingService 的组装完全在 `src/lib/server/billing-service.ts` 内完成，工厂中不再出现 `DefaultBillingService` 和 `paymentProvider: undefined as unknown as PaymentProvider` 等 hack。

## 三、详细执行步骤（按提交粒度拆分）

### 步骤 1：引入 Membership 领域接口（不动现有行为）

- 文件：新建 `src/domain/membership/lifetime-membership-repository.ts`
  - 定义：
    - `LifetimeMembershipRecord`：从当前 `UserLifetimeMembershipRepository` 的 `LifetimeMembershipRecord` 结构抽取必要字段类型。
    - `LifetimeMembershipRepository` 接口：
      - `upsertMembership(input: { userId: string; priceId: string; cycleRefDate: Date; revokedAt?: Date | null }, db?: unknown): Promise<void>`
      - `findActiveByUserIds(userIds: string[], db?: unknown): Promise<LifetimeMembershipRecord[]>`
  - 暂时不引入具体实现，只声明接口和类型。
- 文件：新建 `src/domain/membership/index.ts`
  - Re-export 上述接口和类型，供 domain 层及组合根使用。

### 步骤 2：让 Payment 仓储实现 Membership 接口

- 文件：`src/payment/data-access/user-lifetime-membership-repository.ts`
  - 将本地导出的 `LifetimeMembershipRecord` 类型调整为从 membership 领域导入：
    - `import type { LifetimeMembershipRecord, LifetimeMembershipRepository } from '@/domain/membership';`
  - 让 `UserLifetimeMembershipRepository` 实现 `LifetimeMembershipRepository` 接口：
    - 明确实现 `upsertMembership` / `findActiveByUserIds` 签名。
  - 保持内部使用 `DbExecutor` 的实现逻辑不变。

### 步骤 3：调整 BillingService 依赖：从具体仓储到接口

- 文件：`src/domain/billing/billing-service.ts`
  - 移除对 `@/payment/data-access/user-lifetime-membership-repository` 的直接 import。
  - 引入 `LifetimeMembershipRepository` 接口：
    - `import type { LifetimeMembershipRepository } from '@/domain/membership';`
  - 在 `BillingServiceDeps` 中将 `lifetimeMembershipRepository?: UserLifetimeMembershipRepository` 替换为 `lifetimeMembershipRepository?: LifetimeMembershipRepository`。
  - 构造函数中使用接口类型字段（`private readonly lifetimeMembershipRepository: LifetimeMembershipRepository`）。
  - 其余业务逻辑保持不变（继续使用 `upsertMembership` / `findActiveByUserIds`），以确保功能不变。

### 步骤 4：在 Billing 导出层增加窄接口 BillingRenewalPort

- 文件：`src/domain/billing/billing-service.ts`
  - 新增接口：
    - `export interface BillingRenewalPort { handleRenewal(input: BillingRenewalInput): Promise<void>; grantLifetimePlan(input: GrantLifetimePlanInput): Promise<void>; }`
  - 保证 `DefaultBillingService` 同时实现 `BillingService` 和 `BillingRenewalPort`（实现已经存在，只是类型上补齐）。
- 文件：`src/domain/billing/index.ts`
  - 增加对 `BillingRenewalPort` 的导出：
    - `export type { BillingRenewalPort } from './billing-service';`

### 步骤 5：在组合根中显式注入 Membership 仓储实现

- 文件：`src/lib/server/billing-service.ts`
  - 引入 `LifetimeMembershipRepository` 接口和 `UserLifetimeMembershipRepository` 实现：
    - `import type { LifetimeMembershipRepository } from '@/domain/membership';`
    - `import { UserLifetimeMembershipRepository } from '@/payment/data-access/user-lifetime-membership-repository';`
  - 在 `BillingServiceFactoryOverrides` 类型中允许覆写 `lifetimeMembershipRepository?: LifetimeMembershipRepository`。
  - 在 `createBillingService` 中：
    - 构造 `DefaultBillingService` 时显式传入：
      - `lifetimeMembershipRepository: overrides.lifetimeMembershipRepository ?? new UserLifetimeMembershipRepository(),`
  - 确保对外 API（`getBillingService`, `createBillingService`）不变，只是依赖注入方式更明确。

### 步骤 6：重构 Stripe Factory：职责收敛与 Webhook 依赖简化

- 文件：`src/payment/services/stripe-payment-factory.ts`
  - 目标：让本文件只负责 Stripe 相关 infra，不再创建 `DefaultBillingService` 实例。
  - 调整点：
    - 移除：
      - `CreditLedgerService`, `DefaultBillingService`, `DefaultPlanPolicy`, `isCreditsEnabled`, `PaymentProvider` 等 Billing 相关 import。
    - 将 `StripeProviderOverrides` 类型精简为只包含 Stripe 与 infra 相关依赖：
      - `stripeClient?`, `stripeSecretKey?`, `stripeWebhookSecret?`, `creditsGateway?`, `notificationGateway?`, `userRepository?`, `paymentRepository?`, `stripeEventRepository?`。
      - 去掉 `billingService?: BillingService` 覆盖点（Webhook 不再在 factory 内组装 Billing）。
    - `createStripeInfra`：
      - 构建并返回：`stripeClient`, `stripeWebhookSecret`, `creditsGateway`, `notificationGateway`, `userRepository`, `paymentRepository`, `stripeEventRepository`。
      - 不再构造 `billingService`。
    - `createStripePaymentProviderFromEnv`：
      - 使用 `createStripeInfra` 返回的 `stripeClient`, `userRepository`, `paymentRepository` 构造 `StripePaymentAdapter`，保持现有逻辑。
    - `createStripeWebhookHandlerFromEnv`：
      - 参数签名简化为只负责 Stripe infra：
        - 例如仍接收 overrides，但不再企图在内部 new `DefaultBillingService`。
      - 现在需要一个 `BillingRenewalPort`/`BillingService` 实例由调用方注入：
        - 将 `StripeWebhookHandlerDeps['billingService']` 通过参数传入，而不是在 factory 内 new。
      - 生成 `StripeWebhookHandler` 时，将上层提供的 `billingService`（视为 `BillingRenewalPort`）注入。
  - 中间过渡期可按需要保留旧的 export 签名，但内部实现改为依赖注入，以便逐步迁移调用方。

### 步骤 7：为 Webhook 增加组合根，改用 BillingRenewalPort

- 文件（新建）：`src/lib/server/stripe-webhook.ts`（名称可微调）
  - 责任：组装 `StripeWebhookHandler` 所需的所有依赖，并对外导出一个简单函数：
    - `export async function handleStripeWebhook(payload: string, signature: string): Promise<void> { ... }`
  - 内部逻辑：
    - 使用与 `payment/index.ts` 同源的 env（`serverEnv` 或者通过参数）初始化 Stripe client 与仓储（可复用 `createStripeInfra` 或进一步拆出的 helper）。
    - 获取 `BillingService` 实例：`const billingService = getBillingService();`
    - 将其视为 `BillingRenewalPort` 注入 `StripeWebhookHandler`（类型层面可以通过接口或类型断言）。
    - 调用 `handler.handleWebhookEvent(payload, signature)`。
- 文件：`src/payment/index.ts`
  - 将现有的 `handleWebhookEvent` 逻辑迁移为简单委托：
    - 改为调用 `handleStripeWebhook(payload, signature)`（从新组合根导入），或直接让 `app` 层调用新组合根（视最终依赖图决定）。
- 文件：`src/app/api/webhooks/stripe/route.ts`
  - 将当前对 `@/payment` 的 `handleWebhookEvent` 调用，替换为对新组合根的 `handleStripeWebhook` 调用，或保留现有 API 但内部切换实现。

### 步骤 8：清理与回归检查

- 搜索所有引用：
  - `UserLifetimeMembershipRepository`：确保 `domain` 层不再直接 import，只在组合根/infra 中出现。
  - `BillingRenewalPort`：确认仅被 Webhook 相关路径依赖，其它业务仍用 `BillingService`。
  - `createStripeWebhookHandlerFromEnv`：确认新的签名和依赖注入路径统一。
- 运行相关测试：
  - 支付相关：`src/payment/services/__tests__/*.test.ts`。
  - Billing & Credits：`src/domain/billing/__tests__/*.test.ts`, `src/credits/**/__tests__/*.test.ts`。
  - 如有 Playwright/E2E 覆盖支付流程，可选跑一遍验证。

## 四、注意事项

- 严格保持对外 API 不变（`@/payment`, `@/lib/server/billing-service`, API 路由路径和返回结构不变），只调整内部依赖方向和组合关系。
- 所有新增接口和类型遵循现有命名和注释风格，不引入过度抽象（YAGNI）。
- 逐步迁移，优先保证编译通过和测试绿，再考虑进一步抽象（例如未来的 `MembershipService`）。

## 五、下一步

- 等待用户确认本计划无误后，进入 `[模式：执行]`，按上述步骤依次修改代码，并在关键节点请求反馈。

