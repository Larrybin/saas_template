# CreditsGateway Abstraction

## 背景
目前 `src/credits/services/credits-gateway.ts` 暴露 `DbExecutor`（数据访问层细节），导致上层依赖具体仓储类型并破坏接口抽象。

## 目标
- 引入中立的事务上下文类型或回调机制，使 CreditsGateway 不再依赖仓储实现，同时保持事务支持。

## 任务
1. 设计新的事务接口（如 `TransactionContext` 或 `runInTransaction` 回调），更新 CreditsGateway 定义及 CreditLedgerService 实现。
2. 调整使用方（Webhook handler、tests）以新接口交互。
3. 更新相关测试与文档，验证 `npx tsc --noEmit`、`pnpm test`。

## 当前进展（2025-11）
- 已完成：
  - 在 `src/credits/services/transaction-context.ts` 中将 `CreditsTransaction` 收紧为强类型的 `DbExecutor` 包装，`createCreditsTransaction` / `resolveExecutor` 不再接受/返回 `unknown`/泛型，避免上层泄露具体仓储实现。
  - 所有使用方（`CreditLedgerService`、`StripePaymentService` 的 webhook handler 流程、相关 tests）均通过 `CreditsTransaction` 这一中立包装传递事务执行器，未直接依赖 Drizzle 的 `Transaction` 类型。
  - 严格 TS（`npx tsc --noEmit`）与现有 Vitest 测试通过。
- 待办（后续阶段）：
  - 如需进一步与 Drizzle 解耦，可在 `CreditsGateway` 之上引入回调式事务 API（`runInCreditsTransaction(handler)`），由上层控制事务边界，当前版本保持 wrapper 方案已满足大部分使用场景。

## 状态
- Phase A：完成（2025-11，Owner：Platform）
- Stage B：暂未排期；需回调式事务时再启新计划
