---
title: Credits 账本原子性与幂等加固
---

## 背景
- 当前 `CreditLedgerDomainService` 与 `CreditLedgerRepository` 采用“查-改-插”模式，调用方若未显式包裹事务会出现并发写入和余额/流水不一致风险。
- 需要提供数据库级幂等保证（`userId + type + periodKey`）与结构化日志，确保多次触发不会重复入账。

## 参考最佳实践
- Red Hat 《automation-good-practices》强调通过模块化和 `changed_when` 等机制确保操作具备幂等特性，避免重复执行导致状态漂移（`roles/README.adoc` 中 “Ansible Idempotency…”）。

## 方案
1. **事务化 `addCredits` / `consumeCredits`**  
   - 在 `credit-ledger-domain-service.ts` 中检测传入 executor；若为基础 `DbExecutor`，统一使用 `transaction(async tx => …)` 包裹余额更新与流水写入，确保原子提交。
2. **原子 upsert 与唯一索引使用**  
   - 将 `CreditLedgerRepository.upsertUserCredit` 改为 `insert ... on conflict(user_id) do update`，避免二次查询；现有 `credit_transaction_user_type_period_key_idx` 继续作为周期幂等强约束。
3. **结构化日志与诊断字段**  
   - 在 `credit-ledger-service.ts` 中为 `addCreditsWithExecutor`、`addSubscriptionCredits` 等路径新增 `{ userId, type, periodKey, paymentId }` 等结构化日志，便于排障。
4. **回归测试**  
   - 针对并发加/扣、重复触发（同 periodKey）补充单元/集成测试，模拟事务内与事务外两种调用，确保余额一致。

## 当前状态（更新 2025-12-09）
- ✅ 事务化 `addCredits` / `consumeCredits` 已在 `CreditLedgerDomainService` 中落地：当传入的 executor 不是事务时，统一通过 `executor.transaction(async tx => ...)` 运行余额与流水写入。
- ✅ 原子 upsert：`CreditLedgerRepository.upsertUserCredit` 现使用 `insert ... onConflictDoUpdate`，在冲突分支通过 `currentCredits = currentCredits + :delta` 形式的 SQL 表达式完成原子累加，调用方传入的是本次增量（delta），而非最终余额。
- ✅ 结构化日志：`CreditLedgerDomainService.addCredits` 会输出 `{ userId, type, periodKey, paymentId }`，`CreditLedgerService.addCredits` / `addCreditsWithExecutor` 也通过 `credits.add dispatched from service` 事件统一记录 `{ userId, type, periodKey, paymentId, amount, via }`，方便从服务层追踪调用来源。
- ✅ 回归测试：新增 `src/credits/domain/__tests__/credit-ledger-concurrency.integration.test.ts`，基于真实 PostgreSQL 与 Drizzle 并发调用 `addCredits`，断言最终 `userCredit.currentCredits` 与 `creditTransaction` 金额累积均与并发次数一致，用于防止再次出现 lost update。
