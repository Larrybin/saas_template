## 任务：Webhook 幂等与积分 FIFO/过期修复

### 背景
- Stripe Webhook 可能因并发/重试导致相同 `event_id` 被重复处理，目前 `stripe_event` 表仅记录 processedAt，没有行级锁，存在重复发放风险。
- 积分 FIFO 查询按 `expiration_date ASC` 排序，Postgres 会将 `NULL`（无限期积分）排在最前，导致即将过期的额度无法优先扣减。
- `addCredits` 将 `expireDays <= 0` 判为非法，而免费/月更场景常用 `0` 或 `undefined` 表示“不过期”，从而阻止发放。

### 目标
1. 为 Webhook 处理链路增加事务化行级锁，确保同一事件只被处理一次，并符合 Stripe 官方 idempotency 建议。
2. 调整积分 FIFO 顺序（有限期优先）并在 service 层增加兜底排序，完善相关单元测试。
3. 放宽 `expireDays` 校验语义，让 `undefined/0` 表示“无过期”，补充测试覆盖；同时更新 README，提示配置与安全要求。

### 执行步骤
1. **Webhook 幂等事务化**
   - 更新 `StripeEventRepository`，新增 `withEventProcessingLock`（内部 `insert ... on conflict do nothing` + `SELECT ... FOR UPDATE`）。
   - `stripe-payment-service.ts` 调整 `handleWebhookEvent`，通过上述方法执行 `handleStripeWebhookEvent`，若事件已处理则直接返回。
2. **积分 FIFO 顺序**
   - `credit-ledger-repository.ts` 的 `findFifoEligibleTransactions` 使用 `NULLS LAST`（或 CASE）排序。
   - `credit-ledger-service.ts` 在 `consumeCredits` 中对结果再排序，确保有限期优先；为测试新增覆盖。
3. **`expireDays` 语义修复**
   - 放宽 `addCredits` 校验，`expireDays <= 0` 转为 `undefined`，调用方保持 `undefined`。
   - 为注册/包月等函数与单元测试新增“无过期”场景验证。
4. **文档同步与验证**
   - README 新增关于 Webhook 幂等与 `expireDays` 配置说明。
   - 跑 `node ./node_modules/typescript/bin/tsc --noEmit` 与 `node ./node_modules/vitest/vitest.mjs run src/payment/services/__tests__/stripe-payment-service.test.ts src/credits/services/__tests__/credit-ledger-service.test.ts`。

## Transactional credit purchase
- [x] Expand credit ledger and payment repositories to accept shared transactions.
- [x] Wrap webhook credit purchase/lifetime flows in a single transaction.
- [x] Add regression tests for failed credit grants.

