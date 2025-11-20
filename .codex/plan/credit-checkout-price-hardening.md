# Credit Checkout Price Hardening Plan

## 背景
Stripe credit checkout 允许客户端传入 `priceId`，目前服务端会直接信任该值并用来创建 Checkout Session。攻击者可以选择高额度 `packageId` 搭配低价 `priceId`，导致付款金额与发放积分不匹配，形成财务风险。需要按照 Stripe “价格只能由服务端指定” 的最佳实践进行加固。

## 目标
- 服务端忽略或拒绝任何与套餐配置不一致的 `priceId`。
- 通过测试与日志保障安全性与可观测性。
- 同步团队文档，明确价格控制策略。

## 步骤
1. **服务端价格收紧**
   - 文件：`src/payment/services/stripe-payment-service.ts` / `src/payment/services/stripe-checkout-service.ts`
   - 调整 `createCreditCheckout`，始终从 `creditPackage.price.priceId` 读取 Stripe 价格（现封装在 `StripeCheckoutService` 内）。
   - 若检测到传入的 `priceId` 与配置不符，则抛错并记录安全日志。

2. **元数据与日志**
   - 保持元数据只包含可信 `priceId` 与 `packageId`。
   - 记录潜在篡改尝试，便于审计。

3. **测试**
   - 文件：`src/payment/services/__tests__/stripe-payment-service.test.ts`
   - 新增/更新测试，覆盖 “自动使用配置价格” 与 “非法 price 抛错” 场景。

4. **文档同步**
   - 更新项目内支付说明（如 README 或相关文档），强调 price 仅由后端控制。

5. **验证**
   - 运行 `node ./node_modules/typescript/bin/tsc --noEmit`
   - 运行 `node ./node_modules/vitest/vitest.mjs run src/payment/services/__tests__/stripe-payment-service.test.ts`

## 当前进展（2025-11）
- 已完成：
  - `createCreditCheckout` 价格收紧逻辑已迁移至 `StripeCheckoutService`，统一从 `creditPackage.price.priceId` 读取 Stripe 价格，并在 `priceId` 不一致时调用 `recordPriceMismatchEvent`，抛出 `PaymentSecurityError`（继承自 `DomainError`，code=`PAYMENT_SECURITY_VIOLATION`）。
  - `StripePaymentService` 作为 Facade，仅委托给 `StripeCheckoutService`，支付行为对调用方保持兼容。
  - `src/payment/services/__tests__/stripe-payment-service.test.ts` 覆盖了价格一致/不一致场景；`npx tsc --noEmit` 与对应 Vitest 测试均通过。
  - 前端 `CreditCheckoutButton` 已基于 action 返回的 `code` 区分安全类错误（`PAYMENT_SECURITY_VIOLATION` → 使用 `purchaseFailed` 文案）与一般创建失败（`checkoutFailed`）。

## 状态
- Phase A：完成（2025-11，Owner：Platform）
- Stage B：暂无新增需求，如需扩展其它安全校验请重新开启计划
