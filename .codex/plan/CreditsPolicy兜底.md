## 任务：Credits Policy 兜底逻辑优化

### 1. 背景与问题

- Credits 发放链路由 `CreditLedgerService` + `PlanCreditsPolicy` 共同决定：
  - `PlanCreditsPolicy` 负责从配置中解析积分规则（注册赠送 / 免费月刷新 / 订阅续费 / 终身权益等）；
  - `CreditLedgerService` 负责根据规则和交易上下文，决定是否实际写入积分流水。
- 当前实现中，当 policy 未返回规则（`rule === null`）时，`CreditLedgerService` 多处使用静默 `return`：
  - `addRegisterGiftCredits`；
  - `addMonthlyFreeCredits`；
  - `addSubscriptionCredits`；
  - `addLifetimeMonthlyCredits`。
- 问题：
  - 对“注册赠送 / 免费月刷新”而言，静默跳过通常可接受（属于增强型权益）；
  - 对“订阅续费 / 终身权益”而言，如果因为配置缺失或误配导致规则缺失而静默跳过，很难被发现，会造成用户实际权益与预期不一致。

### 2. 目标与原则

- 目标：
  - 对于增强型权益（注册赠送 / 免费月刷新），保持业务行为不变，但增加日志，提升可观测性；
  - 对于高优先级权益（订阅续费 / 终身权益），将“缺少 policy 规则”视为配置错误，日志 + 抛出显式 DomainError，避免静默丢失权益。
- 设计原则（参考《兜底逻辑设计原则.md》）：
  - 外部配置/策略缺失应在**领域层显式暴露**，而不是静默吞掉；
  - 用户付费权益相关逻辑倾向于 **fail fast**；
  - 注册赠送/免费额度属于可选增强能力，可以兜底为“只记录日志，不抛错”。

### 3. 方案概述（方案 1）

> 部分场景抛错，特别是订阅续费 / 终身权益，其他场景只打日志。

1. 新增 DomainError 类型：
   - 文件：`src/credits/domain/errors.ts`
   - 新增：`CreditsPlanPolicyMissingError extends DomainError`：
     - `code: 'CREDITS_PLAN_POLICY_MISSING'`
     - `message` 默认提示 plan/price 缺少积分 policy；
     - `retryable: false`。

2. “增强权益”场景只记录日志（不抛错）：
   - 文件：`src/credits/services/credit-ledger-service.ts`
   - `CreditLedgerService.addRegisterGiftCredits`：
     - 当前逻辑：`if (!rule) { return; }`
     - 目标逻辑：
       - 当 `rule === null` 时：
         - 使用 `creditsServiceLogger.info` 或 `warn` 记录 `{ userId, type: 'register_gift' }`；
         - 然后 `return`，业务行为保持不变。
   - `CreditLedgerService.addMonthlyFreeCredits`：
     - 当前逻辑：`if (!rule) { return; }`
     - 目标逻辑：
       - 当 `rule === null` 时：
         - 使用 `creditsServiceLogger.info` 记录 `{ userId, planId, type: 'monthly_free' }`；
         - 然后 `return`。

3. “订阅续费 / 终身权益”缺 rule 抛错：
   - 文件：`src/credits/services/credit-ledger-service.ts`
   - `CreditLedgerService.addSubscriptionCredits`：
     - 当前逻辑：`if (!rule) { return; }`
     - 目标逻辑：
       - 当 `rule === null` 时：
         - 使用 `creditsServiceLogger.error` 记录 `{ userId, priceId, type: 'subscription_renewal' }`；
         - 抛出 `new CreditsPlanPolicyMissingError(...)`，将 `priceId` 等信息写入 message。
   - `CreditLedgerService.addLifetimeMonthlyCredits`：
     - 当前逻辑：`if (!rule) { return; }`
     - 目标逻辑：
       - 当 `rule === null` 时：
         - 使用 `creditsServiceLogger.error` 记录 `{ userId, priceId, type: 'lifetime_monthly' }`；
         - 抛出 `new CreditsPlanPolicyMissingError(...)`。

### 4. 对上层调用的预期影响

- 上层调用：
  - `DefaultBillingService.handleRenewal` 调用 `creditsGateway.addSubscriptionCredits`。
  - `DefaultBillingService.grantLifetimePlan` 调用 `creditsGateway.addLifetimeMonthlyCredits`。
- 行为变化：
  - 之前：当 `PlanCreditsPolicy` 返回 `null` 时，这两个调用静默返回，不发积分，也不报错；
  - 之后：当 `PlanCreditsPolicy` 返回 `null` 时，将直接抛出 `CreditsPlanPolicyMissingError`。
- 预期效果：
  - 对“本来就不应发积分”的 plan（credits disabled / 无配置）而言，应由 `PlanPolicy` 在 Billing 层提前过滤（`canGrantSubscriptionCredits` / `creditsConfig.enabled` 等），不会进入抛错分支；
  - 对“配置错误”场景（plan/price 改动后未同步 policy）而言，将通过 DomainError + 日志暴露，避免长期静默。

### 5. 校验与回归

- 执行完成后的检查：
  - `pnpm lint`
  - `npx tsc --noEmit`
  - `pnpm test`（重点关注 credits/billing 相关测试是否假定先前静默行为）。
- 如有必要，为 `CreditsPlanPolicyMissingError` 增加针对性测试，例如：
  - 在 policy 返回 `null` 的条件下调用 `addSubscriptionCredits`，断言抛出该错误而非静默 return。

