## PlanCreditsPolicy & useCurrentPlan 重构执行计划

### 背景
- `.codex/plan/项目架构评审复核.md` 中第 4、5 条要求：统一 plan/credits 策略、抽取 `resolveCurrentPlan` helper 并补测试。
- 现状：`CreditLedgerService` 直接依赖 `credits/config.ts` 的函数，`useCurrentPlan` 内嵌计划解析逻辑，难以复用。

### 工作拆解
1. **PlanCreditsPolicy 设计与实现**
   - 新建 `src/credits/domain/plan-credits-policy.ts`，定义
     - `PlanCreditsRule` 类型；
     - `PlanCreditsPolicy` 接口；
     - `DefaultPlanCreditsPolicy`，内部复用 `credits/config.ts`、`getAllPricePlans`。
   - 方法：`getRegisterGiftRule` / `getMonthlyFreeRule` / `getSubscriptionRenewalRule` / `getLifetimeMonthlyRule` / `resolveCurrentPlan`。
2. **接入 `CreditLedgerService`**
   - 在 `src/credits/services/credit-ledger-service.ts` 中注入 `PlanCreditsPolicy`（默认实例 + `setPlanCreditsPolicy` 便于测试）。
   - `addRegisterGiftCredits` 等方法仅依赖 Policy 提供的数据，不再调用 `getPlanCreditsConfigBy*`。
3. **useCurrentPlan helper**
   - 新增 `src/domain/plan/resolve-current-plan.ts`（复用 Policy 的解析逻辑或导出 helper）。
   - `useCurrentPlan` 调用 helper，保持输出结构不变，并避免重复读取 plans。
4. **测试计划**
   - `src/credits/domain/__tests__/plan-credits-policy.test.ts`：覆盖规则过滤、禁用 plan、不存在配置等场景。
   - `src/domain/plan/__tests__/resolve-current-plan.test.ts`：覆盖 lifetime/订阅/free/disabled 组合。
   - 现有 `CreditLedgerService` 测试通过注入 mock Policy 验证调用。

### 完成标准
- `CreditLedgerService` 仅通过 Policy 获取额度/配置；
- `useCurrentPlan` 使用共享 helper；
- 新增测试全部通过，`pnpm lint && pnpm test && npx tsc --noEmit` 运行无误。

### 补充说明
- Policy 现只通过构造注入控制，默认实例为 CreditLedgerService 内部使用，严禁再新增全局 setter。
