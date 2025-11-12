# CreditsGateway Abstraction

## 背景
目前 `src/credits/services/credits-gateway.ts` 暴露 `DbExecutor`（数据访问层细节），导致上层依赖具体仓储类型并破坏接口抽象。

## 目标
- 引入中立的事务上下文类型或回调机制，使 CreditsGateway 不再依赖仓储实现，同时保持事务支持。

## 任务
1. 设计新的事务接口（如 `TransactionContext` 或 `runInTransaction` 回调），更新 CreditsGateway 定义及 CreditLedgerService 实现。
2. 调整使用方（Webhook handler、tests）以新接口交互。
3. 更新相关测试与文档，验证 `npx tsc --noEmit`、`pnpm test`。
