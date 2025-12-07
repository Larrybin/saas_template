---
title: Creem Payment Phase B 计划（hasAccess/客户端能力 + Better Auth 插件后续）
description: 在 Phase A Provider/Webhook/Billing 链路稳定的基础上，优先完成基于本地 Billing/Credits/Membership 的 hasAccess 能力与客户端 checkout 辅助 API；Better Auth 官方 Creem 插件接入与 ExternalAccessProvider 的 Creem 实现作为 Phase B-Plugin 子阶段，后续在本计划中追加。
---

## 0. 范围与前提

- 前提：`.codex/plan/creem-payment-integration.md` 所述 Phase A 已完成，满足：
  - 非生产环境可通过 `websiteConfig.payment.provider = 'creem'` 使用 `CreemPaymentProvider`；
  - `/api/webhooks/creem` + `CreemWebhookHandler` 已稳定打通 Billing/Credits；
  - 文档（`docs/payment-lifecycle.md` / `docs/env-and-ops.md` / `docs/governance-index.md`）已对 Creem Phase A 做出清晰说明。
- Phase B 当前迭代的主要目标聚焦两件事（不依赖 Better Auth 插件也可完成）：
  - 在 **Auth-domain 侧提供稳定的付费能力视图**（hasAccess / AccessCapability），用于前端/服务端快速判定用户是否拥有某类付费能力；
  - 在 **客户端/Server Actions 侧提供更好的 checkout 辅助 API**（如 `ensure-access-and-checkout` + `useAccessAndCheckout`），但所有计费事实仍由 Payment/Billing/Credits 决定。
- Better Auth 官方 Creem 插件的接入与基于该插件的数据源实现 `ExternalAccessProvider` 的 Creem 版本，被视为 **Phase B-Plugin 子阶段**，在本计划第 7 节单独列出，优先级次于本轮 hasAccess/客户端能力交付。
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
- [x] 在 `src/lib/auth-domain.ts`（或等价文件）中设计一个最小接口：
  - [x] `type AccessCapability = 'plan:pro' | 'plan:lifetime' | 'feature:xxx' | ...`；
  - [x] `async function getUserAccessCapabilities(userId: string): Promise<AccessCapability[]>`；
  - [x] 默认实现基于现有 Billing/Membership/Credits 状态（与 Provider 无关），为后续接入 Creem Better Auth 插件预留统一入口。

### 1.2 Better Auth + Creem 插件集成点（设计层）

- [ ] 调研（或草拟）`@creem_io/better-auth` 插件的典型集成模式（若官方已有插件，优先对齐；否则先按本仓库约定设计抽象）：
  - [ ] 插件负责从 Creem 侧拉取/缓存用户订单/订阅视图；
  - [ ] 插件 API 提供 `hasAccess(userId, capability)` 或类似能力；
  - [ ] 插件内部如需访问 Creem REST API，只能用于：
    - [ ] 按需回源校准/排障（一次性任务），不得在每个请求路径上实时调用 Creem 做授权判定；
    - [ ] 严格通过 Payment/Billing/Credits 与 Membership 的映射进行解释，避免形成第二套业务规则或事实来源。
- [x] 在本仓库中定义一个适配层接口（不依赖具体插件实现）：
  - [x] `interface ExternalAccessProvider { hasAccess(userId: string, capability: AccessCapability): Promise<boolean>; }`
  - [x] 默认实现为 no-op（或始终返回 false），并在 Phase B 里仅在非生产环境通过 Creem 插件注入具体实现。
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

- [x] 审查现有 Payment Actions（例如 `create-checkout-session` / `create-credit-checkout-session` 等），确认：
  - [x] 在 provider 为 `'creem'` 时，是否已经透明使用 `CreemPaymentProvider`；
  - [x] metadata 中是否已经按 Phase A 约定写入 `user_id/product_type/credits/provider_id/request_id`。
- [x] 设计 Phase B 新增/优化的 Action/Endpoint（只在非生产环境启用 Creem 分支）：
  - [x] 新增一个更语义化的 Server Action：`ensure-access-and-checkout`：
    - 输入：`mode = 'subscription' | 'credits'`、`capability`、`planId/priceId` 或 `packageId/priceId` 以及可选 metadata；
    - 行为：先通过 Auth-domain `getUserAccessCapabilities` 检查是否已有访问能力，若没有，再调用 Payment/Billing 或 Payment Provider 创建 checkout；
    - 输出：`{ success: true, data: { alreadyHasAccess, checkoutUrl?, checkoutId? } }` 形态的 envelope。
  - [x] 将 Datafast 相关的 revenue tracking metadata 组装逻辑在 Action 层通过 `attachDatafastMetadata` helper 统一处理，避免在各个 checkout Action 中重复注入 cookies 与 feature flag 分支，但保持 metadata 语义与 Phase A 一致。
  - [x] 确保该 Action 对 Stripe/Creem 一视同仁，只通过 `websiteConfig.payment.provider` + `getPaymentProvider` 选择 Provider。
  - [x] 在所有访问控制/checkout 入口中明确约束：
    - [x] 不依赖 `request_id` 作为 hasAccess 判定的 key；`request_id` 仅用于跟踪单次 checkout 请求和对账（只在 `checkout.completed` webhook 中返回）；
    - [x] 访问能力判定以 Subscription/Lifetime/Membership 记录为准，由 Webhook + Billing/Credits/Membership 写入本地数据库后统一提供给 Auth-domain 使用。

### 2.2 前端消费模式（UI/Hooks）

- [x] 设计一个统一 Hook，用于在前端消费 hasAccess 与 checkout 能力（示意）：
  - [x] `useAccessAndCheckout({ capability, mode, planId, priceId, packageId, metadata })`：
    - 暴露：`hasAccess`（布尔）、`isLoading`、`startCheckout()` 等；
    - 内部调用 Server Actions，避免直接在前端散落 provider 分支。
- [ ] 在典型页面（如 Pricing/Billing Settings）中引入该 Hook 的示例用法，但不强制改造所有现有 UI：
  - [ ] Pricing 页：根据 hasAccess 结果显示“已拥有/升级”状态；
  - [x] Settings 页：根据 hasAccess 控制部分设置项的展示/禁用。

---

## 3. Payment/Billing/Credits 与 Auth 的边界说明补强

**目标：** 在文档与类型注释层面强化“Payment/Billing/Credits 是唯一计费事实来源”，避免 Better Auth / 插件引入第二事实源。

### 3.1 类型与注释层

- [x] 更新 `src/payment/types.ts` 中 `PaymentProviderId` 周边注释：
  - [x] 在说明默认 Provider 已切换为 Creem、Test/Live 由 `CREEM_API_URL` 决定的基础上，补充 Phase B 的定位：Creem 集成后，Auth/插件只消费 Payment/Billing 的结果，不可自行改写账本。
- [ ] 在 `src/domain/billing/billing-service.ts` 与 Membership 相关代码附近增加简要注释：
  - [ ] 说明“终身会员 / 订阅资格的唯一授予路径”为 Billing + Credits + Membership 的组合；
  - [ ] Auth/插件只能读取这些结果（如 lifetime membership 表、Subscriptions），不能直接写入。

### 3.2 文档层

- [x] 在 `docs/feature-modules.md` 中补充一段简短说明：
  - [x] Payment/Billing/Credits 模块负责计费事实与账本；
  - [x] Auth 模块（含 Better Auth 插件）仅负责鉴权与访问控制视图，所有收费能力最终以 Payment/Billing 记录为准。
- [x] 在 `docs/governance-index.md` 中，将 Phase B 的 Creem + Better Auth 集成纳入“Credits / Billing / Payment 领域”专题下：
  - [x] 标注其依赖 `.codex/plan/creem-payment-integration.md`（Phase A）与本 Phase B plan；
  - [x] 简要记录“不允许出现第二套计费事实来源”的治理原则。

---

### 3.3 与 Creem 官方协议的一致性与额外不变式

- [x] 在本 plan 中显式对齐以下来自 Creem 官方文档的协议约束，并作为 Phase B 长期不变式：
  - [x] `request_id` 仅作为**追踪/审计标识**使用：
    - [x] 在 `CreemPaymentProvider` 中继续通过 `request_id` + `metadata` 将 `user_id` / `product_type` / `credits` / `provider_id: 'creem'` 写入 checkout 请求；
    - [x] 在 `CreemWebhookHandler` 中只将 `request_id` 用于日志、对账与审计，不以 `request_id` 是否存在/匹配作为 hasAccess 或授予 Membership/Credits 的直接依据。
  - [x] `metadata` 仅作为**映射/标签**使用，而非第二账本：
    - [x] 在 checkout/Subscription 的 `metadata` 中稳定写入内部 plan/feature 上下文（如 `plan_id`、`price_id` 映射），便于在 Webhook 中解析为 `AccessCapability` 所需的 plan/feature 维度；
    - [x] Auth-domain 中的访问能力只能从 Billing/Credits/Membership 与 Payment 表推导，禁止在 Auth 层基于 `metadata` 单独维护一套“权限/额度表”。
  - [x] Return URL 与 hasAccess 的强边界（与 `docs/payment-lifecycle.md` 一致）：
    - [x] 即便 Return URL 上携带 Creem 官方文档中提到的签名/状态参数，也只能用于前端 UX（提示/跳转），不得参与 `getUserAccessCapabilities` 或 `ExternalAccessProvider.hasAccess` 的判断；
    - [x] Creem 支付成功到 hasAccess 生效之间允许存在短暂窗口，直到对应 webhook 事件落库为止，不做基于 Return URL 的乐观授权。
  - [x] ExternalAccessProvider 不得以 Creem API 实时结果作为授权“真值来源”：
    - [x] 如需访问 Creem REST API，只用于按需回源校准/排障或填充诊断信息，不得在请求路径上以「Creem API 返回 active」作为放行 hasAccess 的唯一条件；
    - [x] 任意 ExternalAccessProvider 调用失败、超时或返回“不确定”时，都必须回退到本地 Billing/Credits/Membership 视图，并按“无访问能力”处理 UI 行为（仅引导升级/重试，不授予访问权限）。

---

## 4. 渐进式启用策略与安全边界

**目标：** 确保 Phase B 在引入 Better Auth/hasAccess 能力时，不影响现有 Stripe-only/Stripe+Creem 配置的安全性。

- [x] 明确非生产/生产环境启用策略：
  - [x] 在非生产环境下，允许通过 Feature Flag 或 env（如 `CREEM_BETTER_AUTH_ENABLED`）启用 Creem 插件集成；
  - [x] 在生产环境，默认禁用 Creem 插件，直到经过单独评审与压测（此条可在后续根据产品策略调整）。
- [x] 在 plan 中记录一条不变式：
  - [x] 即便 Better Auth 插件已经集成 hasAccess 能力，也不得绕过 Payment/Billing/Credits 的安全校验链路进行“直通式升级或授予访问能力”。
 - [x] 对 Return URL 的使用做显式约束：
   - [x] Return URL 回调上的参数与签名只能用于前端 UX（提示/跳转），不得直接用于判断 hasAccess 或授予 Membership/Credits；
   - [x] 任意基于 Creem 事件的访问能力变更，仍必须通过 `/api/webhooks/creem` + `CreemWebhookHandler` → Billing/Credits/Membership 这条链路完成。

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

---

## 7. Phase B-Plugin：Better Auth Creem 插件集成（后续子阶段草案）

> 本节描述在完成本轮 Phase B（hasAccess/客户端能力）后，若需要进一步集成 Better Auth 官方 Creem 插件时的补充任务。该子阶段不影响当前模板在 Stripe/Creem Phase A 下的可用性，可按需单独排期。

- [x] 前置：接入 Better Auth Creem 插件（Database Mode）
  - [x] 在 `src/lib/auth.ts` 中按官方文档配置 Better Auth Creem 插件，优先选择 `persistSubscriptions: true` 的数据库模式；
  - [x] 确认插件将 Creem 订阅/订单同步到本地数据库或 session claims，而非只依赖 API Mode 的实时调用（当前通过 Database Mode + `checkSubscriptionAccess` 组合，仅在 `CREEM_BETTER_AUTH_ENABLED=true` 时启用）。
- [x] ExternalAccessProvider 的 Creem 实现（仅负责 `feature:*` 能力）
  - [x] 在 `src/lib/server/creem-external-access-provider.ts` 中新增 `createCreemExternalAccessProvider()`，实现 `ExternalAccessProvider` 接口：
    - [x] 对 `capability` 以 `feature:` 前缀开头的能力进行判断，其余（`plan:*`）一律返回 `false`；
    - [x] 通过 Better Auth Creem 插件暴露的接口（server helper `checkSubscriptionAccess` + Database Mode 视图）读取用户的 feature entitlements（当前实现为最小能力：`feature:creem:any-subscription`）；
    - [x] 任意错误/超时仅记录日志，返回 `false`，不得扩权。
  - [x] 在合适的 server 组合根中（如 `src/lib/server/auth-access-provider.ts`）根据 feature flag 注入：
    - [x] 新增配置项（例如 `CREEM_BETTER_AUTH_ENABLED` 或 `websiteConfig.auth.creemBetterAuthEnabled`）；
    - [x] 在非生产环境且开关开启时调用 `setExternalAccessProvider(createCreemExternalAccessProvider())`，生产默认为 no-op。
- [x] 测试与监控
  - [x] 为 `createCreemExternalAccessProvider` 编写单元测试，覆盖：
    - [x] `feature:*` 能力的正向/反向判断；
    - [x] 插件抛错/超时时返回 `false` 并记录日志；
    - [x] 对 `plan:*` 能力一律返回 `false` 的约束。
  - [x] （可选）在 dev 环境中增加一个仅用于对账的日志模式，对比：
    - [x] 本地 `getUserAccessCapabilities` 输出的 `plan:*` / `feature:*`；
    - [x] Creem 插件视图中的 access flags，记录差异以便审计，但不改变授权决策。
