---
title: Creem Payment Phase B 计划（Better Auth 插件集成 + hasAccess/客户端能力）
description: 在 Phase A Provider/Webhook/Billing 链路稳定的基础上，引入基于 Creem 的 Better Auth 插件与访问控制能力，打通 hasAccess、客户端 checkout 辅助 API，并确保 Payment/Billing/Credits 仍是唯一计费事实来源。
---

## 0. 范围与前提

- 前提：`.codex/plan/creem-payment-integration.md` 所述 Phase A 已完成，满足：
  - 非生产环境可通过 `websiteConfig.payment.provider = 'creem'` 使用 `CreemPaymentProvider`；
  - `/api/webhooks/creem` + `CreemWebhookHandler` 已稳定打通 Billing/Credits；
  - 文档（`docs/payment-lifecycle.md` / `docs/env-and-ops.md` / `docs/governance-index.md`）已对 Creem Phase A 做出清晰说明。
- Phase B 目标只聚焦两件事：
  - 在 **Auth/Beter Auth 侧引入 Creem 访问控制能力**（hasAccess / membership 等），用于前端/服务端快速判定用户是否拥有某类付费能力；
  - 在 **客户端/Server Actions 侧提供更好的 Creem checkout 辅助 API**（如带有 metadata 的标准化触发点），但所有计费事实仍由 Payment/Billing/Credits 决定。
- 非目标（本阶段不做）：
  - 不新增新的 Payment Provider 类型（仍然只在 `PaymentProviderId = 'stripe' | 'creem'` 范围内活动）；
  - 不改变现有 Payment/Billing/Credits 的表结构与关键业务语义；
  - 不引入第二套计费事实来源，Better Auth 插件只做访问控制视图/缓存。

---

## 1. Better Auth 集成：Creem-aware 访问控制（hasAccess）

**目标：** 在 Better Auth 上层提供一个轻量的“访问控制视图”，能够基于当前用户的订阅/Lifetime 信息判断是否具备某类能力，但不修改 Billing/Credits 的事实来源。

### 1.1 Auth 层预留与适配

- [ ] 在 `src/lib/auth.ts` 中：
  - [ ] 增加一段清晰注释，标记 Better Auth 与 Payment/Billing 的分工：
    - Payment/Billing/Credits 是计费事实来源；
    - Auth 侧仅负责暴露“当前用户具有哪些付费能力”的快照视图（如 role/feature flags/hasAccess）。
  - [ ] 预留（而非立即实现）与 Creem 插件对接的挂载点，例如：
    - 通过 Better Auth 的插件机制注入 `hasAccess` 风格的 helper；
    - 或在 `auth-domain` / `user-lifecycle` 层增加一个可选的 Creem access adapter。
- [ ] 在 `src/lib/auth-domain.ts`（或等价文件）中设计一个最小接口：
  - [ ] `type AccessCapability = 'pro-plan' | 'lifetime' | 'feature:xxx' | ...`；
  - [ ] `async function getUserAccessCapabilities(userId: string): Promise<AccessCapability[]>`；
  - [ ] 默认实现基于现有 Billing/Membership/Credits 状态（与 Provider 无关），为后续接入 Creem Better Auth 插件预留统一入口。

### 1.2 Better Auth + Creem 插件集成点（设计层）

- [ ] 调研（或草拟）`@creem_io/better-auth` 插件的典型集成模式（若官方已有插件，优先对齐；否则先按本仓库约定设计抽象）：
  - [ ] 插件负责从 Creem 侧拉取/缓存用户订单/订阅视图；
  - [ ] 插件 API 提供 `hasAccess(userId, capability)` 或类似能力；
  - [ ] 插件内部如需访问 Creem REST API，只能用于：
    - [ ] 按需回源校准/排障（一次性任务），不得在每个请求路径上实时调用 Creem 做授权判定；
    - [ ] 严格通过 Payment/Billing/Credits 与 Membership 的映射进行解释，避免形成第二套业务规则或事实来源。
- [ ] 在本仓库中定义一个适配层接口（不依赖具体插件实现）：
  - [ ] `interface ExternalAccessProvider { hasAccess(userId: string, capability: AccessCapability): Promise<boolean>; }`
  - [ ] 默认实现为 no-op（或始终返回 false），并在 Phase B 里仅在非生产环境通过 Creem 插件注入具体实现��
- [ ] 确保 `ExternalAccessProvider` 的判断逻辑只用作“前端/权限视图”，不会直接控制账本/积分变更。
 - [ ] 当 ExternalAccessProvider 或本地数据源无法确定访问能力时，前端/服务端调用方必须采取“安全降级”：
   - [ ] 将结果视为“无访问能力”并展示升级路径或隐藏入口；
   - [ ] 严禁在不确定状态下放行访问（避免因为依赖 Creem API 的短暂故障而打破授权边界）。

---

## 2. 客户端 checkout 辅助与 hasAccess 消费路径

**目标：** 为前端和 Server Actions 提供更友好的 API，用于：
- 触发基于 Creem 的 checkout；
- 在 UI 中利用 hasAccess 结果调整展示，而不散落直接调用 Payment/Billing 的逻辑。

### 2.1 Server Actions 与 API 设计

- [ ] 审查现有 Payment Actions（例如 `create-checkout-session` / `create-credit-checkout-session` 等），确认：
  - [ ] 在 provider 为 `'creem'` 时，是否已经透明使用 `CreemPaymentProvider`；
  - [ ] metadata 中是否已经按 Phase A 约定写入 `user_id/product_type/credits/provider_id/request_id`。
- [ ] 设计 Phase B 新增/优化的 Action/Endpoint（只在非生产环境启用 Creem 分支）：
  - [ ] （可选）新增一个更语义化的 Server Action，例如 `ensure-access-and-checkout`：
    - 输入：`capability` + `planId/priceId` + 可选 metadata；
    - 行为：先通过 Auth-domain `getUserAccessCapabilities` 检查是否已有访问能力，若没有，再调用 Payment/Billing 创建 checkout；
    - 输出：标准 checkout URL 或错误 envelope。
  - [ ] 确保该 Action 对 Stripe/Creem 一视同仁，只通过 `websiteConfig.payment.provider` + `getPaymentProvider` 选择 Provider。
  - [ ] 在所有访问控制/checkout 入口中明确约束：
    - [ ] 不依赖 `request_id` 作为 hasAccess 判定的 key；`request_id` 仅用于跟踪单次 checkout 请求和对账（只在 `checkout.completed` webhook 中返回）；
    - [ ] 访问能力判定以 Subscription/Lifetime/Membership 记录为准，由 Webhook + Billing/Credits/Membership 写入本地数据库后统一提供给 Auth-domain 使用。

### 2.2 前端消费模式（UI/Hooks）

- [ ] 设计一个统一 Hook，用于在前端消费 hasAccess 与 checkout 能力（示意）：
  - [ ] `useAccessAndCheckout({ capability, planId, priceId, providerHint? })`：
    - 暴露：`hasAccess`（布尔）、`isLoading`、`startCheckout()` 等；
    - 内部调用 Server Actions，避免直接在前端散落 provider 分支。
- [ ] 在典型页面（如 Pricing/Billing Settings）中引入该 Hook 的示例用法，但不强制改造所有现有 UI：
  - [ ] Pricing 页：根据 hasAccess 结果显示“已拥有/升级”状态；
  - [ ] Settings 页：根据 hasAccess 控制部分设置项的展示/禁用。

---

## 3. Payment/Billing/Credits 与 Auth 的边界说明补强

**目标：** 在文档与类型注释层面强化“Payment/Billing/Credits 是唯一计费事实来源”，避免 Better Auth / 插件引入第二事实源。

### 3.1 类型与注释层

- [ ] 更新 `src/payment/types.ts` 中 `PaymentProviderId` 周边注释：
  - [ ] 在保留 Phase A Phase Gate 描述的基础上，补充 Phase B 的定位说明：Creem 集成后，Auth/插件只消费 Payment/Billing 的结果，不可自行改写账本。
- [ ] 在 `src/domain/billing/billing-service.ts` 与 Membership 相关代码附近增加简要注释：
  - [ ] 说明“终身会员 / 订阅资格的唯一授予路径”为 Billing + Credits + Membership 的组合；
  - [ ] Auth/插件只能读取这些结果（如 lifetime membership 表、Subscriptions），不能直接写入。

### 3.2 文档层

- [ ] 在 `docs/feature-modules.md` 中补充一段简短说明：
  - [ ] Payment/Billing/Credits 模块负责计费事实与账本；
  - [ ] Auth 模块（含 Better Auth 插件）仅负责鉴权与访问控制视图，所有收费能力最终以 Payment/Billing 记录为准。
- [ ] 在 `docs/governance-index.md` 中，将 Phase B 的 Creem + Better Auth 集成纳入“Credits / Billing / Payment 领域”专题下：
  - [ ] 标注其依赖 `.codex/plan/creem-payment-integration.md`（Phase A）与本 Phase B plan；
  - [ ] 简要记录“不允许出现第二套计费事实来源”的治理原则。

---

## 4. 渐进式启用策略与安全边界

**目标：** 确保 Phase B 在引入 Better Auth/hasAccess 能力时，不影响现有 Stripe-only/Stripe+Creem 配置的安全性。

- [ ] 明确非生产/生产环境启用策略：
  - [ ] 在非生产环境下，允许通过 Feature Flag 或 env（如 `CREEM_BETTER_AUTH_ENABLED`）启用 Creem 插件集成；
  - [ ] 在生产环境，默认禁用 Creem 插件，直到经过单独评审与压测（此条可在后续根据产品策略调整）。
- [ ] 在 plan 中记录一条不变式：
  - [ ] 即便 Better Auth 插件已经集成 hasAccess 能力，也不得绕过 Payment/Billing/Credits 的安全校验链路进行“直通式升级或授予访问能力”。
 - [ ] 对 Return URL 的使用做显式约束：
   - [ ] Return URL 回调上的参数与签名只能用于前端 UX（提示/跳转），不得直接用于判断 hasAccess 或授予 Membership/Credits；
   - [ ] 任意基于 Creem 事件的访问能力变更，仍必须通过 `/api/webhooks/creem` + `CreemWebhookHandler` → Billing/Credits/Membership 这条链路完成。

---

## 5. 测试与验证（Phase B 范围）

- [ ] Auth-domain 层测试：
  - [ ] 为 `getUserAccessCapabilities` 等方法增加最小单元测试，覆盖“已有订阅/无订阅/Lifetime”等典型分支；
  - [ ] 若引入 ExternalAccessProvider mock，在测试中验证它不会改变计费事实，只影响 hasAccess 结果。
- [ ] Server Actions / Hooks 测试：
  - [ ] 为新引入的 “ensure-access-and-checkout” Action 添加正向/负向测试；
  - [ ] 为前端 Hook（如 `useAccessAndCheckout`）添加最小行为测试（可通过 react-testing-library/vitest）。
- [ ] 文档验证：
  - [ ] 在 `docs/payment-lifecycle.md` / `docs/feature-modules.md` 补充/更新后，检查与 `.codex/plan/creem-payment-integration.md`（Phase A）及本 Phase B 计划的叙述是否一致。

---

## 6. 结束条件（Phase B）

当满足以下条件时，可认为 **Creem Payment Phase B** 完成：

- Better Auth / Auth-domain 层已经提供稳定的 `getUserAccessCapabilities` 或等价 hasAccess 能力；
- 前端/Server Actions 已有至少一处示例使用该能力触发/优化 checkout 流程；
- 所有新能力都明确遵守“Payment/Billing/Credits 为唯一计费事实来源”的治理约束；
- 相关文档（`docs/feature-modules.md`、`docs/governance-index.md`、必要时的 `docs/payment-lifecycle.md` 补充）已更新，并指向本 plan 作为 Phase B 的实现清单。
