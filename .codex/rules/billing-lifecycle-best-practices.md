---
title: 订阅计费与生命周期管理最佳实践
description: 基于 MkSaaS 模板与 Stripe 的订阅与计费生命周期设计规范
---

## 适用范围

- Stripe 集成：`src/payment/*`、`src/app/api/webhooks/stripe`
- 订阅/计划领域：`src/domain/billing/*`、`src/domain/plan/*`
- 与 Credits / Feature 控制相关的业务模块：`src/credits/*`、`src/ai/*`

## 设计目标

- 明确订阅生命周期（创建、续费、变更、取消、过期）的状态机。
- Webhook 作为事实来源（source of truth），前端操作仅发起意图。
- 计费结果与应用状态（plan、Credits、feature access）保持一致。

## 核心原则

1. **前端驱动意图，后端基于 Webhook 落地**
   - 前端或 API 调用只创建 Checkout Session / Billing Portal Session。
   - 用户完成支付后，由 Stripe Webhook 更新本地订阅与用户状态。
   - 避免在前端返回成功后立刻修改本地状态，而不等待 Webhook。

2. **以 Subscription 为核心实体**
   - 在 `src/payment` 与 `src/domain/billing` 中，围绕 Stripe Subscription 建立本地模型：
     - 当前计划、续费日期、取消状态、试用期等。
   - 所有“是否可以访问高级功能”的判断，都应基于统一的 billing 领域服务。

3. **幂等与错误可观测性**
   - Stripe Webhook：
     - 使用 `stripeEventId` 作为幂等键，避免重复处理事件。
     - 对非预期异常使用专门错误码（例如 `STRIPE_WEBHOOK_UNEXPECTED_ERROR`），便于监控聚合。
   - 任何失败都应记录足够上下文：客户 ID、订阅 ID、事件类型。

4. **生命周期事件对业务的影响明确**
   - 关键事件：
     - 订阅创建 / 激活：授予对应 plan 权限与初始 Credits。
     - 升级计划：立即提高权限与额度（可选择按比例调整当前周期）。
     - 降级计划：在当前计费周期结束时生效，避免立即降级打断用户体验。
     - 取消订阅：保留到当前周期结束，之后进入“过期”状态。
     - 付款失败 / 逾期：进入 Grace Period，并适当限制某些敏感操作。

5. **与 Credits 与 Feature Flags 解耦**
   - 订阅状态决定“理论上可用的能力与额度上限”。
   - Credits 表与 Feature Flags 负责“实际当前可用额度与开关”：
     - 例如，试用期可以给有限 Credits，而不必建立真实订阅。

## 实践要点（结合本仓库）

1. Webhook 处理
   - `src/app/api/webhooks/stripe/route.ts`：
     - 验证签名、解析事件后，应尽快将事件转交给 `src/payment/services` 层处理。
     - 对 DomainError 分支使用统一 JSON envelope 与错误码。
     - 非 DomainError 分支使用专门错误码，帮助定位 Stripe 集成问题。

2. 订阅状态模型
   - `src/domain/billing/*`：
     - 保持订阅状态机简单清晰：例如 `active`、`trialing`、`past_due`、`canceled`、`incomplete`。
   - `src/domain/plan/*`：
     - 集中定义可售卖的 plan 元数据、每个 plan 对应的能力与额度上限。

3. 与 UI 的交互
   - Pricing 页面与设置页（`src/components/pricing/*`、`src/components/settings/billing/*`）：
     - 只调用高层 billing API，例如“生成 Checkout URL”、“打开 Billing Portal”。
     - 所有实际状态显示（当前 plan、续费日期）来自本地 billing 读服务，而不是直接从 Stripe API 即时查询。

4. 测试与沙盒环境
   - 为关键 webhook 事件添加集成测试：
     - 创建订阅、升级、降级、取消、付款失败、退款等。
   - 区分测试/开发/生产环境的 Stripe key 与 webhook endpoint，避免串环境。

## 反模式（应避免）

- 在前端根据 Stripe 返回值立即修改本地订阅状态，而不等待 Webhook。
- 在多个地方直接调用 Stripe SDK，而不是集中通过 `src/payment/services`。
- 将 Credits 逻辑直接写在 Webhook 内而不经过 Credits 领域服务。

## Checklist

- [ ] 任意用户的订阅状态都可以通过本地 billing 服务完整恢复。
- [ ] 所有涉及订阅变更的 UI 交互都只负责发起意图，不直接写数据库。
- [ ] Stripe Webhook 具有幂等处理与完善的错误日志。

## 实施进度 Checklist

- 已基本符合
  - [x] 支付入口与 Webhook 统一通过 `src/payment` 抽象：`createCheckout`、`createCustomerPortal`、`handleWebhookEvent` 等方法隐藏 Stripe 具体实现。
  - [x] 订阅与计划领域已拆分为 `src/domain/billing/*` 与 `src/domain/plan/*`，并在 `billing-service.ts`、`plan-policy.ts` 中集中定义状态机与额度策略。
  - [x] Stripe Webhook 路由 `/api/webhooks/stripe` 使用统一的 JSON envelope 返回 DomainError，非 DomainError 分支也返回标准错误结构并打日志。
- 尚待调整 / 确认
  - [ ] `StripePaymentService` 与 `billing-service` 内对 Stripe 事件的幂等处理（例如按 `event.id` 记录处理状态）是否在所有关键事件上完整实现并有测试覆盖。
  - [ ] Pricing 页面与设置页是否完全依赖本地 billing 读服务（domain 层）展示当前 plan / 续费信息，而不是在组件中直接调用 Stripe API。
  - [ ] 与 Credits 联动的边界（例如订阅变更时触发的积分发放/回收）是否在 `docs/credits-lifecycle.md` 与本规则之间保持一致说明。
