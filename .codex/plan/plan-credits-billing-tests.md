## 任务：Plan / Credits / Billing 深度测试覆盖补强

### 1. 背景

- 域模型：
  - Plan 决策：`src/domain/plan/resolve-current-plan.ts`
  - Credits 策略：`src/credits/domain/plan-credits-policy.ts`
  - Credits 领域服务：`src/credits/domain/credit-ledger-domain-service.ts`
  - Credits 应用服务：`src/credits/services/credit-ledger-service.ts`
  - Billing 聚合：`src/domain/billing/billing-service.ts`
- 现有测试：
  - 计划与策略：
    - `src/domain/plan/__tests__/resolve-current-plan.test.ts`
    - `src/credits/domain/__tests__/plan-credits-policy.test.ts`
  - Credits：
    - `src/credits/domain/__tests__/credit-ledger-domain-service.test.ts`
    - `src/credits/services/__tests__/credit-ledger-service.test.ts`
    - `src/credits/services/__tests__/credit-ledger-service-errors.test.ts`
    - `src/credits/distribution/__tests__/credit-distribution-service.test.ts`
    - `src/credits/__tests__/distribute-lifetime-membership.test.ts`
  - Billing：
    - `src/domain/billing/__tests__/billing-service.test.ts`
- 差距：
  - 对“业务兜底”类规则（计划缺失、CreditsPolicy 缺失、全局关闭 credits 等）的行为缺乏系统性测试说明。
  - Plan / Credits / Billing 之间的接口契约主要靠单元测试和手工验证，缺少几个有代表性的场景用例。

### 2. 目标

- 围绕关键业务场景（订阅续费、终身权益、注册赠送/免费刷新）补充跨域测试，使以下规则有清晰、可执行的验证：
  - 全局 `creditsEnabled` 为 false 时，不应发生任何 credits 相关发放；
  - Subscription / Lifetime 对应的 `PlanCreditsPolicy` 缺失时，计费 path 上抛出专用 DomainError（而不是静默）；
  - 免费计划与注册赠送的兜底逻辑（不发放但不抛错）被测试覆盖并与文档一致。

### 3. BillingService 场景测试增强

- 文件：`src/domain/billing/__tests__/billing-service.test.ts`
- 新增用例：
  - `skips renewal handling when credits are globally disabled`：
    - 构造 `DefaultBillingService`，`creditsEnabled = false`；
    - 调用 `handleRenewal`；
    - 断言：`creditsGateway.addSubscriptionCredits` 未被调用。
  - `skips renewal handling when subscription credits config is missing`：
    - 基于 `createPlanPolicy`，将 `getPlanCreditsConfigByPriceId` mock 为返回 `null`；
    - `creditsEnabled = true`；
    - 调用 `handleRenewal`；
    - 断言：`creditsGateway.addSubscriptionCredits` 未被调用。
- 补充说明：
  - BillingService 不直接抛出 `CreditsPlanPolicyMissingError`，而是依赖下游 `CreditLedgerService`；此处只验证其不会在无 rule 时错误地触发 credits 发放。

### 4. PlanCreditsPolicy 兜底语义补充

- 文件：`src/credits/domain/__tests__/plan-credits-policy.test.ts`
- 新增/强化用例：
  - 注册赠送：
    - `filters out register gift rules with non-positive amount`：
      - `amount = 0` 时 `getRegisterGiftRule()` 返回 `null`。
  - 免费计划月度刷新：
    - 在原有“非 free plan”的基础上，额外验证 `disabled = true` 时 `getMonthlyFreeRule()` 返回 `null`。
  - 订阅续费策略：
    - `filters out disabled or zero-amount subscription renewal rules`：
      - `amount = 0` 或 `disabled = true` 时 `getSubscriptionRenewalRule()` 返回 `null`。
- 对齐文档：
  - 确保 `PlanCreditsPolicy` 不会为被禁用或零额度的规则返回可用策略，避免误发积分。

### 5. CreditLedgerService 与 PlanCreditsPolicy 集成兜底

- 文件：`src/credits/services/__tests__/credit-ledger-service-plan-policy.test.ts`
- 新增测试：
  - `throws CreditsPlanPolicyMissingError when subscription renewal rule is missing`：
    - 构造一个 `PlanCreditsPolicy` mock，使 `getSubscriptionRenewalRule` 返回 `null`；
    - 使用该 policy 实例化 `CreditLedgerService`；
    - 调用 `addSubscriptionCredits`；
    - 断言：抛出 `CreditsPlanPolicyMissingError`。
  - `throws CreditsPlanPolicyMissingError when lifetime monthly rule is missing`：
    - `getLifetimeMonthlyRule` 返回 `null`；
    - 调用 `addLifetimeMonthlyCredits`；
    - 断言：同样抛出 `CreditsPlanPolicyMissingError`。
- 日志：
  - 通过在测试中 mock `getLogger`，避免真实日志输出，同时确保不会因 logger 访问失败导致用例不稳定。

### 6. 注册赠送与免费月度额度路径

- 文件：`src/credits/services/__tests__/credit-ledger-service-register-free.test.ts`
- 新增测试：
  - 注册赠送（register gift）：
    - 当 `getRegisterGiftRule` 返回有效规则且用户尚无 REGISTER_GIFT 交易时：
      - `CreditLedgerService.addRegisterGiftCredits` 会调用底层 `addCredits`，写入一条 `REGISTER_GIFT` 类型交易；
      - 第二次调用时，由于 `hasTransactionOfType` 返回 true，不会重复发放。
    - 当 `getRegisterGiftRule` 返回 `null` 时：
      - 方法直接返回，不调用 `addCredits`，符合“业务兜底但不抛错”的预期。
  - 免费月度额度（monthly free）：
    - 当 `getMonthlyFreeRule` 返回 free 计划规则且 `canAddCreditsByType` 为 true 时：
      - `addMonthlyFreeCredits` 会调用 `addCredits`，写入一条 `MONTHLY_REFRESH` 类型交易，附带 `periodKey` 与 `expireDays`；
      - 同一 period 下再次调用时，`canAddCreditsByType` 为 false，不再重复发放。
    - 当 `getMonthlyFreeRule` 返回 `null` 时：
      - 方法仅记录日志并返回，不调用 `addCredits`。

### 7. 验证

- 更新后执行：
  - `pnpm test`（全量 Vitest）：
    - 新增的 Billing / PlanCreditsPolicy / CreditLedgerService 测试均已加入 test suite，并通过；
    - 集成测试 `src/domain/billing/__tests__/billing-to-credits.integration.test.ts` 现包含：
      - 订阅续费路径：`BillingService.handleRenewal` 触发 `CreditLedgerService.addSubscriptionCredits` 并更新余额 + 交易记录；
      - 终身购买路径：`BillingService.grantLifetimePlan` 触发 `CreditLedgerService.addLifetimeMonthlyCredits`，更新余额 + 交易，并调用 `MembershipService.grantLifetimeMembership` 落库终身会员记录（复用传入事务）。
  - 如有需要，可在后续 CI 中将这些场景列为“核心计费回归测试”。

### 8. AI 调用前置扣费链路（free quota + Credits）

- 文件：
  - `src/lib/server/usecases/__tests__/execute-ai-chat-with-billing.test.ts`
  - `src/lib/server/usecases/__tests__/generate-image-with-credits.test.ts`
  - `src/lib/server/usecases/__tests__/analyze-web-content-with-credits.test.ts`
- 覆盖目标：
  - 对 `executeAiChatWithBilling` / `generateImageWithCredits` / `analyzeWebContentWithCredits` 三个 use case：
    - 当 `incrementAiUsageAndCheckWithinFreeQuota` 返回 `true` 时：
      - 不调用 `consumeCredits`；
      - 仍然执行后续 AI 调用（streamText / experimental_generateImage / handleAnalyzeContentRequest）；
      - 断言传入的 `feature` 分别为 `chat` / `generate-image` / `analyze-content`。
    - 当 free quota 耗尽（返回 `false`）时：
      - 按计费配置默认每次扣除 1 积分；
      - `consumeCredits` 被调用且描述分别为：
        - Chat：`AI chat usage (1 credits)`；
        - Image：`AI image generation (1 credits)`；
        - Analyze：`AI web content analysis (1 credits)`。
    - 当 `consumeCredits` 抛出 `InsufficientCreditsError` 时：
      - use case 直接向上传递该 DomainError；
      - 不进入实际的 AI 调用阶段（streamText / generateImage / handleAnalyzeContentRequest 未被调用）。
- Mock 策略：
  - 通过 Vitest mock 拦截：
    - `@/ai/usage/ai-usage-service`：控制 free quota 分支行为；
    - `@/credits/credits`：模拟积分不足错误；
    - `ai` / `@ai-sdk/*` / `@/ai/text/utils/analyze-content-handler`：替换为本地轻量实现，避免真实网络调用。
- 对齐目标：
  - 验证“先判断免费额度，再扣积分，最后调用 AI”的顺序约定在三个核心 AI use case 中保持一致；
  - 为后续在 API Route 层对 `InsufficientCreditsError` 做统一 HTTP 封装提供安全网。
