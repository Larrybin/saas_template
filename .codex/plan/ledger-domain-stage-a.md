# 任务：Ledger Domain 分层阶段A

## 背景
- distribute.ts 与 credit-ledger-service.ts 混合 SQL + 业务规则，事务边界模糊。
- 目标阶段A：抽象 repository 接口，创建 Domain Service，将现有 SQL 迁移至该服务，并让 credit-ledger-service 作为 Facade。

## 计划
1. 梳理 credit ledger 相关函数与 SQL，以便逐一迁移。
2. 定义 ICreditLedgerRepository 接口，并让现有 repository 实现它，移除隐式 getDb()。
3. 新建 CreditLedgerDomainService：封装 add/consume/processExpired/canAdd 等逻辑，统一依赖 repository+executor。
4. 重写 credit-ledger-service.ts：调用 Domain Service，暴露原 API。
5. 更新调用点（暂以 service 自身为主），确保 lint/type 通过。

## 当前进展（2025-11）
- 已完成：
  - `ICreditLedgerRepository` 接口与 `CreditLedgerRepository` 实现，并抽象了所有 SQL 访问（包括 `findTransactionByTypeAndPeriodKey`、`findFirstTransactionOfType` 等）。
  - `CreditLedgerDomainService` 承担 add/consume/processExpired/canAdd/hasTransactionOfType 等领域逻辑，所有查询/更新均通过 repository + `DbExecutor` 完成。
  - `credit-ledger-service.ts` 作为 Facade，仅负责解析 `CreditsTransaction`/`DbExecutor` 并委托给 DomainService，原有导出 API 保持兼容。
  - 对应 Vitest 已更新/通过，`npx tsc --noEmit` 在严格 TS 配置下编译通过。
- 待办：
  - 长期目标仍然是进一步减少 Domain 层对 `getDb` 默认 provider 的依赖（当前以构造函数参数形式存在），将连接/事务控制完全上移到 orchestrator 层。

## 状态
- Phase A：完成（2025-11，Owner：Platform）
- Stage B：未排期，若需继续推进请新开 plan 并指定 owner
