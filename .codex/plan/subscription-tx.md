# Subscription Transaction Hardening

## Goal
Ensure customer.subscription.* webhook handling updates payment records and grants credits atomically, mirroring the checkout credit purchase flow.

## Tasks
1. Wrap `onCreateSubscription`, `onUpdateSubscription`, and (if needed) `onDeleteSubscription` logic inside `paymentRepository.withTransaction`, passing the transaction to repository calls and CreditsGateway methods.
2. Ensure renewal detection and credit grants occur within the same transaction so failures roll back and propagate to Stripe.
3. Update tests in `src/payment/services/__tests__/stripe-payment-service.test.ts` to cover the transactional subscription flow and failure propagation.
4. Run `npx tsc --noEmit` and `pnpm test`.

## 当前进展（2025-11）
- 已完成：
  - `onCreateSubscription` / `onUpdateSubscription` / `onOnetimePayment` / `onCreditPurchase` 已全部运行在 `paymentRepository.withTransaction` 中，对 `PaymentRepository` 与 `CreditsGateway` 的调用共享同一事务上下文；失败时会抛错，让 Stripe Webhook 可以按建议策略重试。
  - 测试文件 `src/payment/services/__tests__/stripe-payment-service.test.ts` 已覆盖订阅创建、续费与失败传播路径（包括积分发放失败导致事务回滚的场景）。
  - 严格 TS 与相关 Vitest 测试通过。
