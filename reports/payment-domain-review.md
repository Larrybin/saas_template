# 支付域审查报告（静态审查）

## 基线
- `/t3dotgg/stripe-recommendations`：事件白名单、KV 同步、防分裂。
- `/goldbergyoni/nodejs-testing-best-practices`：重放/幂等测试、AAA。

## 评分矩阵（1–5）
- 正确性与鲁棒性 3（webhook 有锁，状态同步/幂等不足）
- 可读性 4（分层清晰）
- 一致性 3.5（provider 选择策略不一致）
- 复杂度 3（逻辑直线，缺状态回填）
- 性能 3.5（缓存 provider）
- 安全性 3（验签有，但缺事件白名单/失败日志）
- 可测试性 3（可注入，缺重放/失败用例）
- 扩展性 3.5（工厂可扩展）
- 依赖与边界 3（依赖 websiteConfig/serverEnv，缺注入隔离）
- 日志与可观测性 2.5（初始化/选择缺日志/指标）
- 测试覆盖 3（缺关键场景）

## 发现表（复核 2025-12-09）
- 中 | src/payment/services/stripe-payment-factory.ts:42-86 | env 缺失仍是直接 `throw new Error(...)`，未进行结构化日志/告警上报，定位困难 | 可观测性/鲁棒性 | 基线：可观测性
- 中 | src/lib/server/creem-webhook.ts:48-82; src/app/api/webhooks/creem/route.ts:17-35 | Creem webhook 对缺失 payload/signature 仍返回 `UNEXPECTED_ERROR`，未复用 `PAYMENT_SECURITY_VIOLATION`，日志缺少 `reason` 字段，难以监控安全事件 | 正确性/安全性 | 基线：事件安全/白名单

### 状态更新（已解决）
- ✅ `paymentProviderFactory` 现以 `websiteConfig.payment.provider` 为真值来源，provider 选择一致；冲突问题已消除（`src/payment/index.ts:32-44`）。
- ✅ `StripeWebhookHandler` 结合 `stripe_event` 表提供事件白名单+幂等锁，重复事件会被跳过（`src/payment/services/stripe-webhook-handler.ts:55-72`，`src/db/schema.ts:140-151`）。
- ✅ `processSubscriptionRenewalWithCredits` 已将 Stripe 订阅状态与 Billing/Credits 流程收口，状态回填落地（`src/lib/server/usecases/process-subscription-renewal-with-credits.ts`）。

## 测试缺口表
- Provider 选择冲突/未知 provider 场景。
- Webhook 重放/未知事件/验签失败路径。
- Env 缺失/错误配置启动失败路径。
- 状态同步：支付成功后拉全量并对齐本地。

## 建议表（更新后）
- 高 | Creem webhook 安全错误应统一返回 `PAYMENT_SECURITY_VIOLATION`，并记录 `reason`（`missing-payload`/`missing-signature`）供监控；同时补充文档与报警 | 依据：src/lib/server/creem-webhook.ts; src/app/api/webhooks/creem/route.ts
- 中 | Stripe provider env 校验需输出结构化日志 + metrics，并在启动阶段通过 `error-monitoring` 上报缺失配置 | 依据：stripe-payment-factory.ts:42-86
- 低 | 继续扩展 `payment.stripe`/`payment.creem` 日志上下文（provider/userId/priceId/eventId），统一观测方式 | 依据：全域日志缺口

## 简短摘要
风险集中在 provider 选择不一致、webhook 缺白名单/显式幂等与状态回填、配置缺失无告警。需统一选择策略、持久化幂等键与事件过滤、状态同步与可观测性增强。***
