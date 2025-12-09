# 积分域审查报告（静态审查）

## 基线
- `/apptension/saas-boilerplate`：计费/订阅幂等、防分裂、状态同步。
- `/goldbergyoni/nodejs-testing-best-practices`：AAA、集成化、并发/幂等覆盖。

## 评分矩阵（1–5）
- 正确性与鲁棒性 2.5（写入无全局事务，幂等缺失）
- 可读性 4（分层/命名清晰）
- 一致性 3（日志与错误字段不统一）
- 复杂度 3（流程直线但缺幂等/事务）
- 性能 3（过期批处理整批事务，潜在锁竞争）
- 安全性 3（无危险 IO，配置未校验）
- 可测试性 3（有测试但缺并发/幂等/失败回滚）
- 扩展性 3（策略耦合上层配置）
- 依赖与边界 2.5（域层读取 websiteConfig/price-plan）
- 日志与可观测性 2.5（缺关键字段/指标）
- 测试覆盖 3（存在 __tests__，但缺核心场景）

## 发现表（截至 2025-12-09）
- 高 | src/credits/domain/credit-ledger-domain-service.ts:108-206 | `addCredits` 仍是「查余额→更新→插流水」串行操作，调用方若未显式开启事务即存在线程间竞态，余额与流水可能分裂 | 正确性/鲁棒性 | 基线：幂等与一致性（apptension）
- 高 | src/credits/data-access/credit-ledger-repository.ts:18-46 | `upsertUserCredit` 仍依赖“先查再 update/insert”，缺 `ON CONFLICT` 或行锁；并发加扣存在丢失更新风险 | 正确性/鲁棒性 | 基线：幂等与一致性
- 中 | src/credits/expiry-job.ts:63-125 | 过期批处理虽会写日志，但异常仅累计计数，缺少指标/告警钩子，长时间失败难以感知 | 可观测性/鲁棒性 | 基线：可观测性与重试
- 低 | src/credits/services/credit-ledger-service.ts:174-268 | 周期发放日志仍缺 `periodKey/paymentId` 等核心字段，排障困难 | 可观测性 | 基线：结构化日志

### 状态更新（已解决）
- ✅ **周期幂等**：`credit_transaction_user_type_period_key_idx` 已存在（`src/db/schema.ts:118-136`），`credit-distribution-service.ts:92-135` 也对 `23505` 冲突做跳过处理；原“缺唯一索引”风险已解除。
- ✅ **策略注入**：`DefaultBillingService` 通过 `planPolicy` 注入（`src/domain/billing/billing-service.ts:46-60`），`createBillingService` 可覆写（`src/lib/server/billing-service.ts:22-41`），域层不再直接读取 `websiteConfig`。

## 测试缺口表
- 并发/原子性：并发加/扣、失败回滚（无相应用例，__tests__ 未覆盖这些场景）
- 周期幂等：同 periodKey 重放/并发防重复；唯一索引冲突路径
- 过期作业：部分失败后重跑幂等，分页/大批量，错误告警/指标
- 配置变体：免费/付费/终身/禁用/expireDays null 分支
- 观测：日志字段/指标校验

## 建议表（更新后）
- 高 | 将 `addCredits`/`upsertUserCredit` 置于同一事务，并改用 `ON CONFLICT` 或行锁原子累加余额；串行写入前后需输出 requestId/periodKey 便于排障 | 依据：credit-ledger-domain-service.ts; credit-ledger-repository.ts
- 中 | 过期作业拆分为「单用户事务 + 指标/告警」，同时暴露 batchId/batchSize 以供监控 | 依据：expiry-job.ts:63-150
- 低 | 补齐授予/扣减日志字段（`userId/type/periodKey/paymentId/batchId`），并将 `creditsGateway` 对外 API 统一带上 context | 依据：credit-ledger-service.ts:174-268

## 简短摘要
核心问题是缺少原子性与幂等（事务/唯一索引），配置耦合上层，过期作业与日志可观测性不足；需引入 DB 级幂等、防重复策略与结构化日志，补充并发/幂等/失败回滚测试。另需注意：订阅续费 → Credits 发放的跨域调用链已在 Payment/Billing 侧通过 usecase `processSubscriptionRenewalWithCredits`（`src/lib/server/usecases/process-subscription-renewal-with-credits.ts`）收口，本报告仅聚焦 Credits 核心账本与策略本身。***
