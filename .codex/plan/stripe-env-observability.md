---
title: Stripe Provider 配置可观测性
---

## 背景
- `stripe-payment-factory.ts` 在缺少 `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` 时直接 `throw new Error(...)`，日志与指标缺失，无法在运行期识别。

## 参考最佳实践
- Node.js Best Practices 建议“彻底测试错误流，并保证错误以一致结构返回”（`/goldbergyoni/nodebestpractices`，Error Handling > Test error flows），强调要显式处理配置缺失等操作性错误。

## 方案
1. **结构化错误处理**  
   - 在 `resolveStripeSecretKey` / `resolveStripeWebhookSecret` 中使用自定义 `ConfigurationError`（继承 `Error`，带 `code: 'STRIPE_CONFIG_MISSING'`）；记录 `{ span: 'payment.stripe', missingKeys }`。
2. **指标与报警**  
   - 将上述错误通过现有 logger 输出到 APM，同时触发自定义 Counter（如 `payment_stripe_config_missing_total`）。
3. **启动前检测**  
   - 在 `createBillingService` 或独立健康检查中调用 `initializePaymentProvider()`，若抛 `ConfigurationError` 则阻断启动并提示需要的 env 列表。
4. **测试与文档**  
   - 新增单测覆盖 env 缺失分支。  
   - 在 `docs/env-and-ops.md` 标注“Stripe Provider 启动前自检”，链接本计划。

## 当前状态（更新 2025-12-09）
- ✅ 结构化错误处理：`resolveStripeSecretKey` / `resolveStripeWebhookSecret` 在缺失对应 env 时不再直接 `throw new Error`，而是通过 `stripeConfigLogger` 输出 `{ span: 'payment.stripe', provider: 'stripe', missingKeys }` 日志，并抛出 `ConfigurationError`（复用 storage 模块中的通用配置错误类型），便于在日志平台和 APM 中统一识别。  
- ⏳ 指标与报警：当前仅通过 logger 输出错误上下文，尚未引入独立的 metrics（如 `payment_stripe_config_missing_total`）；待后续统一接入监控体系时一并落地。  
- ⏳ 启动前检测：目前仍依赖调用方在构造 Stripe Provider 时触发配置错误，尚未在 `createBillingService` 或独立健康检查中追加显式预检。  
- ✅ 测试与文档：`src/payment/services/__tests__/stripe-payment-factory.test.ts` 已覆盖缺失 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` 分支，断言会抛出 `ConfigurationError`；`docs/env-and-ops.md` 中原有说明“初始化 Payment Provider 时会抛错”与当前行为保持一致，后续可视需要补充指向本计划的链接。
