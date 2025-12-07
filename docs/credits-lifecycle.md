# Credits 生命周期与边界说明

> 本文聚焦「积分（Credits）」从创建、发放、消费到过期的全生命周期，以及与 Billing / Payment / Auth / Job 等模块的边界关系。  
> 目录结构与模块概览请参考 `docs/architecture-overview.md` 与 `docs/feature-modules.md`。

---

## 1. 背景与适用场景

Credits 模块用于抽象「用量型计费」能力，典型场景包括：

- AI 调用计费（Chat / 文本分析 / 图片生成等）。
- 订阅计划附带的周期性额度（按 plan/price 分配积分）。
- 一次性积分套餐购买或运营活动赠送。

设计目标：

- 将「额度管理」从具体业务（AI、存储等）解耦为独立领域。
- 支持多种来源（注册赠送、订阅、套餐、人工调整等）和统一消费接口。
- 保证在高并发/失败重试场景下，账本仍然保持一致性和可追踪性。

---

## 2. 核心实体与主要模块

### 2.1 数据模型（简要）

- 积分余额（聚合视图）  
  - 表示用户当前可用积分总数（如 `userCredit.currentCredits`）。  
  - 由账本消费/发放操作派生，通常不直��由外部模块写入。

- 积分交易记录（明细）  
  - 记录每次「发放」或「消费」操作（如 `creditTransaction` 表）：  
    - `amount` / `remainingAmount`  
    - `type`（注册赠送、订阅续费、套餐购买、人工调整等）  
    - `periodKey`（用于月度/周期性额度幂等控制）  
    - `expireAt`（可选，表示过期时间）。

### 2.2 模块划分

- 领域层（Domain）：`src/credits/domain/*`
  - `CreditLedgerDomainService`：账本核心逻辑（发放、消费、过期处理等）。  
  - 领域错误：`InvalidCreditPayloadError`, `InsufficientCreditsError`, `CreditsPlanPolicyMissingError` 等。  
  - Rule/policy：`plan-credits-policy.ts` 等，用于从 plan/price/配置推导积分规则。

- 数据访问层（Repository）：`src/credits/data-access/*`
  - `CreditLedgerRepository`：封装对 `userCredit` / `creditTransaction` 等表的访问。  
  - 仅被领域服务和服务层使用，不直接暴露给 API/UI。

- 服务层 / 网关：`src/credits/services/*`
  - `credit-ledger-service.ts`：  
    - 对上暴露稳定 API：`addCredits`, `consumeCredits`, `addSubscriptionCredits`, `addLifetimeMonthlyCredits` 等。  
    - 对下持有 `CreditLedgerDomainService` 与 `CreditLedgerRepository`。  
  - `CreditsGateway` 接口：供 Billing / Usecase 依赖，实现领域间解耦。

- Job & Usecase：  
  - Job 入口：  
    - `src/credits/distribute.ts`：积分分发 Job 编排逻辑。  
    - `src/credits/expiry-job.ts`：过期处理逻辑。  
  - Usecase：  
    - `src/lib/server/usecases/distribute-credits-job.ts`：对外暴露「运行分发 Job」的 usecase。  
    - `src/lib/server/usecases/*with-credits.ts`：AI + 积分消费类 usecase。

### 2.3 Membership 域（终身会员）

- 领域层：`src/domain/membership/*`
  - `LifetimeMembershipRepository`：抽象终身会员记录的读写能力（当前实现为 `UserLifetimeMembershipRepository`，基于 `user_lifetime_membership` 表）。  
  - `MembershipService` / `DefaultMembershipService`：
    - `grantLifetimeMembership`：根据 user/price/cycleRefDate 统一落库或更新终身会员记录，内部处理事务执行器的解析；  
    - `findActiveMembershipsByUserIds`：按用户批量查询当前有效的终身会员记录（用于 Credits 分发等场景）。
- server 组合根：`src/lib/server/membership-service.ts`
  - `createMembershipService` / `getMembershipService`：
    - 默认注入 `UserLifetimeMembershipRepository`，构建 `DefaultMembershipService`；  
    - 为 Billing、Credits 等领域提供统一的 Membership 领域服务实例。

---

## 3. 生命周期阶段

本节从「事件 → 调用链 → 持久化影响」的角度描述典型场景。

### 3.1 用户注册（注册赠送）

- 事件触发：
  1. 用户在 `[locale]/auth/register` 完成注册。
  2. better-auth 完成数据库写入后，触发 `databaseHooks.user.create.after`。

- 调用链：
  - `src/lib/auth.ts` → `handleAuthUserCreated(...)`（位于 `src/lib/auth-domain.ts`）  
    → `UserLifecycleManager.emit({ type: 'user:created', ... })`  
    → UserLifecycle hooks：
    - `src/lib/user-lifecycle/hooks/credits.ts` 中注册赠送 Hook：  
      调用 `addRegisterGiftCredits(userId)`。
  - `addRegisterGiftCredits` 实现：  
    - `src/credits/services/credit-ledger-service.ts`：  
      - 检查用户是否已有同类型交易（避免重复赠送）。  
      - 从 `DefaultPlanCreditsPolicy` 获取注册赠送规则。  
      - 通过 `CreditLedgerDomainService` + Repository 写入账本记录并更新余额。

- 持久化影响：
  - 新增一条 `creditTransaction`（type = `REGISTER_GIFT`），可选带 `expireAt`。  
  - 更新 `userCredit.currentCredits` 增加对应额度。

### 3.2 订阅续费（周期性积分发放）

- 事件触发：
  - Stripe 订阅续费等事件经 `/api/webhooks/stripe` → `handleStripeWebhook` → Payment 领域（内部由 `StripeWebhookHandler` 与 Billing/Credits 协同处理），最终触发续费处理：
    - 入口在 `src/app/api/webhooks/stripe/route.ts`，通过 `handleStripeWebhook(payload, signature)` 调用 Webhook 组合根；  
    - 组合根再委托给 Stripe 适配层与 WebhookHandler，按照事件类型更新 Payment 状态并触发续费处理。

- 调用链（简化）：
  - Webhook：`src/app/api/webhooks/stripe/route.ts`  
    → `src/payment/index.ts` → `StripePaymentAdapter` / `StripeWebhookHandler`  
    → 业务事件分类后调用 Billing 域：
  - Billing 域：`src/domain/billing/billing-service.ts`：
    - `handleRenewal({ userId, priceId, cycleRefDate?, transaction? })`：
      1. 根据 `priceId` 调用 `planPolicy.getPlanCreditsConfigByPriceId(priceId)` 获取积分配置。  
      2. 若 `creditsEnabled` 或该 plan 未启用积分，则直接返回。  
      3. 通过 `creditsGateway.addSubscriptionCredits(userId, priceId, refDate, transaction)` 发放周期性积分。
  - Credits 网关：`CreditLedgerService.addSubscriptionCredits`：
    - 使用 `getPeriodKey(refDate)` 计算 `periodKey`。  
    - 通过 `canAddCreditsByType` 检查当前周期是否已发放过同类型积分（幂等控制）。  
    - 构造 payload（amount/description/periodKey/expireDays 等），调用 `addCredits` 写入账本。

- 持久化影响：
  - 每个计费周期至多新增一条 type = `SUBSCRIPTION_RENEWAL` 的交易记录。  
  - 更新用户积分余额；依赖 `periodKey` 保证不会重复入账。

### 3.3 Lifetime 用户月度发放

- 事件触发：
  - 与 3.2 类似，通常由 webhook 或后台脚本触发 `grantLifetimePlan`。

- 调用链：
  - Billing 域：`DefaultBillingService.grantLifetimePlan`：
    - 校验 plan 是否为 lifetime，并且全局 `creditsEnabled`。  
    - 调用 `creditsGateway.addLifetimeMonthlyCredits(userId, priceId, refDate, transaction)`。  
    - 使用 `UserLifetimeMembershipRepository` 更新/插入 lifetime membership 记录。
  - Credits 网关：`CreditLedgerService.addLifetimeMonthlyCredits`：
    - 类似 `addSubscriptionCredits`，但 type 为 `LIFETIME_MONTHLY`，并使用 `getPeriodKey` 控制周期。

- 持久化影响：
  - 新增 lifetime membership 记录（如尚不存在）。  
  - 每个自然周期发放一条 type = `LIFETIME_MONTHLY` 的交易记录，并更新余额。

#### 3.3.1 Webhook → Billing → MembershipService 时序（简化）

下图以「一次性 Lifetime 购买 + 首次授予终身会员」为例说明调用顺序：

```text
Stripe       →  /api/webhooks/stripe  →  handleStripeWebhook  →  StripeWebhookHandler
  │                      │                      │                        │
  │  POST event          │                      │                        │
  │─────────────────────▶│                      │                        │
  │                      │  read payload/text   │                        │
  │                      │────────────────────▶ │                        │
  │                      │  handleStripeWebhook(payload, signature)      │
  │                      │──────────────────────────────────────────────▶│
  │                      │                      │  constructEvent +      │
  │                      │                      │  withEventProcessingLock
  │                      │                      │──────────────────────▶ │
  │                      │                      │  handleStripeWebhookEvent(event, deps)
  │                      │                      │──────────────────────▶ │
  │                      │                      │                        │  onOnetimePayment/…
  │                      │                      │                        │  ├─ 写入 payment 记录
  │                      │                      │                        │  └─ 调用
  │                      │                      │                        │     billingService.grantLifetimePlan(...)
  │                      │                      │                        │────────────────────────────▶
  │                      │                      │                        │
  │                      │                      │                        │  DefaultBillingService.grantLifetimePlan:
  │                      │                      │                        │  ├─ 校验 plan/credits 配置
  │                      │                      │                        │  ├─ 调用 CreditsGateway.addLifetimeMonthlyCredits
  │                      │                      │                        │  └─ 调用
  │                      │                      │                        │     membershipService.grantLifetimeMembership(...)
  │                      │                      │                        │────────────────────────────▶
  │                      │                      │                        │
  │                      │                      │                        │  DefaultMembershipService.grantLifetimeMembership:
  │                      │                      │                        │  └─ 解析 transaction executor 并
  │                      │                      │                        │     调用 LifetimeMembershipRepository.upsertMembership
```

### 3.4 积分套餐购买 / 人工调整（如适用）

- 事件触发：
  - 用户在前端触发「购买积分」入口，调用如 `createCreditCheckoutSession` 等 Action。  
  - Stripe 付款完成后，经 webhook / 后台任务调用 Credits 发放 API。

- 调用链（典型）：
  - 前端：调用 `src/actions/create-credit-checkout-session.ts` 等。  
  - Payment：在 webhook 处理中根据支付结果（packageId 等）调用某个“发放积分”的 usecase。  
  - Credits：通过 `addCredits` 或特定包装函数（如 `addSubscriptionCredits` 的变体）写入账本。

- 持久化影响：
  - 按套餐配置一次性新增若干积分交易记录（一般为单条 type = `PACKAGE_PURCHASE`）。  
  - 更新用户余额。

### 3.5 积分消费（AI 调用等）

- 事件触发：
  - 用户在前端触发 AI 接口（Chat/Text/Image），对应调用 `/api/chat`、`/api/analyze-content`、`/api/generate-images`。

- 调用链（以 Chat 为例）：
  - API Route：`src/app/api/chat/route.ts`：
    - 使用 `ensureApiUser` + `enforceRateLimit` + request logger。  
    - 解析并校验请求体后，调用 usecase：  
      `executeAiChatWithBilling({ userId, messages, model, webSearch })`。
  - Usecase：`src/lib/server/usecases/execute-ai-chat-with-billing.ts`：
    1. 读取计费规则（每次调用消耗积分数量、免费额度等）。  
    2. 若在免费额度内：只更新 usage 记录，不调用 `consumeCredits`。  
    3. 否则：调用 `consumeCredits({ userId, amount, description })` 扣减积分。  
    4. 按业务逻辑调用 AI Provider 并返回响应（或抛出 `DomainError` 如 `CREDITS_INSUFFICIENT_BALANCE`）。
  - Credits 领域：`CreditLedgerDomainService.consumeCredits`：
    - 在事务内检查余额，若不足则抛 `InsufficientCreditsError`（映射为 `CREDITS_INSUFFICIENT_BALANCE`）。  
    - 按 FIFO 规则扣减 `creditTransaction.remainingAmount`。  
    - 更新 `userCredit.currentCredits` 与 usage 记录。

- 持久化影响：
  - 不产生新增发放记录，仅更新现有交易的剩余金额与用户余额。  
  - 所有消费操作均可通过 `creditTransaction` 与 usage 表追踪。

### 3.6 Job：周期分发与过期处理

- 事件触发：
  - 外部 Cron（如 Cloudflare/Vercel Scheduler）请求 `/api/distribute-credits`。  
  - 或内部任务/脚本调用 `runCreditsDistributionJob` / `processExpiredCredits`。

- 调用链：
  - API Route：`src/app/api/distribute-credits/route.ts`：
    - 通过 `validateInternalJobBasicAuth` 校验 Basic Auth。  
    - 调用 `runCreditsDistributionJob()`，并返回统一 envelope（success/data 或 error/code/retryable）。
  - Usecase：`src/lib/server/usecases/distribute-credits-job.ts`：
    - 使用 `createJobLogger`（或等价逻辑）生成 `jobRunId`，记录开始/结束日志。  
    - 调用 `distributeCreditsToAllUsers()`（位于 `src/credits/distribute.ts`）。  
    - 统计 `usersCount`/`processedCount`/`errorCount` 并返回。
  - Credits Job：`src/credits/distribute.ts`：
    - 读取用户与订阅快照（通过 `user-billing-view` 等 data-access）。  
    - 对不同用户类型（免费、订阅、lifetime）应用对应的积分发放策略。  
    - 可能调用 `processExpiredCredits` 处理过期。
  - 过期处理：`src/credits/expiry-job.ts` / `CreditLedgerDomainService.processExpiredCredits`：
    - 遍历即将/已经过期的交易记录，将其标记为过期并扣减余额。

- 持久化影响：
  - 每次 Job 运行可能新增若干发放交易记录与过期调整记录。  
  - `jobRunId` 关联的日志可用于追踪特定批次的状态与异常。

---

## 4. 边界与依赖方向

### 4.1 对 UI / Actions / API 的边界

- UI 层（`src/app`, `src/components`）与积分模块的交互仅通过：
  - Server Actions：`src/actions/*`（例如 `get-credit-balance`, `get-credit-stats`, `get-credit-transactions`, `consume-credits`）。  
  - Usecase + API Route：`/api/chat`, `/api/analyze-content`, `/api/generate-images`, `/api/distribute-credits` 等。
- UI 不直接引用 `CreditLedgerDomainService` 或 Repository，也不直接操作数据库表。
 - Credits 相关错误的前端处理入口集中在 `useCreditsErrorUi`（`src/hooks/use-credits-error-ui.ts`）与 `domain-error-ui-registry.ts`，具体约定可参考 `docs/error-logging.md`。

### 4.2 对 Billing / Payment 的边界

- Billing 域（`src/domain/billing/*`）只通过 `CreditsGateway` 认识积分模块：
  - 典型接口：`addSubscriptionCredits`, `addLifetimeMonthlyCredits` 等。  
  - 不直接依赖 `CreditLedgerRepository` 或数据库 schema。
- Payment 模块负责与 Stripe 等外部支付服务交互，并在需要时调用 Billing 域，而不是直接操作 credits。

### 4.3 对 Auth / User-Lifecycle 的边界

- Auth 模块（`src/lib/auth.ts` / `auth-domain.ts`）不直接写积分，只在用户创建事件时触发 UserLifecycle hooks。  
- UserLifecycle 通过 `UserLifecycleManager`（`src/lib/user-lifecycle/*`）统一管理钩子，  
  如注册赠送积分、自动订阅 Newsletter 等，每个 hook 只负责自己领域的副作用。

### 4.4 Job / Cron 的边界

- 外部系统（如 Cron）只能通过受保护的 `/api/distribute-credits` 调用积分分发 Job：  
  - Basic Auth 由 `validateInternalJobBasicAuth` 统一处理。  
  - 日志规范由 `job-logger` / `runCreditsDistributionJob` 统一控制。  
- 内部脚本若需运行 Job，应调用 usecase 层（`runCreditsDistributionJob` / `processExpiredCredits`），  
  而不是直接拼装 SQL 或操作 Repository。

---

## 5. 领域不变式与约束（示例）

> 以下为目前设计所依赖的关键不变式，后续如需更改应在代码与文档中同步更新。

1. **余额不可为负**  
   - 任意时刻，`userCredit.currentCredits` 必须 ≥ 0。  
   - 消费操作前必须检查余额，余额不足时抛出 `InsufficientCreditsError`（`CREDITS_INSUFFICIENT_BALANCE`），由上层用统一错误 envelope 返回。

2. **周期性积分发放幂等**  
  - 通过 `periodKey` + `type` 约束，同一用户在同一周期内，type 为 `SUBSCRIPTION_RENEWAL` 或 `LIFETIME_MONTHLY` 的交易至多出现一次。  
  - 重复调用 `addSubscriptionCredits` / `addLifetimeMonthlyCredits` 不会重复累加余额。
  - 对于分发 Job（`distributeCreditsToAllUsers`）中按批次生成的周期性发放命令，即使存在并发执行或重试导致的重复插入尝试，也会依赖数据库唯一约束 + 业务层对 `23505` 错误的处理，将重复命令标记为 skipped 而非错误，确保整批 Job 不会因为单个用户的重复发放而失败。

3. **注册赠送仅发放一次**  
   - 注册赠送 hook 必须在发放前检查是否已经存在 type = `REGISTER_GIFT` 的交易记录。  
   - 后续对同一用户重复调用注册赠送逻辑不再产生新交易。

4. **过期处理的幂等性**  
   - 过期 Job 在相同时间窗口内可安全重试：  
     - 对已过期的交易不会重复扣减余额。  
     - 对尚未过期的交易不会提前扣减。

5. **AI 调用前后计费一致性**  
   - Usecase 层（如 `executeAiChatWithBilling`, `analyzeWebContentWithCredits`, `generateImageWithCredits`）在进行付费调用前必须确认：  
     1. 若在免费额度内，只更新 usage，不扣减积分。  
     2. 若需扣积分，则在成功消费后再调用下游 AI Provider；若消费失败（如余额不足），不应发起 Provider 请求。

---

## 6. 与其他文档的关系

- `docs/architecture-overview.md`：从整体架构和 usecase 视角描述 Credits 在系统中的位置。  
- `docs/feature-modules.md`：从「特性模块」视角说明 Credits 与 Billing/Payment/AI 的协作关系。  
- 本文则聚焦于：
  - Credits 的生命周期（事件流与持久化影响）；  
  - 领域边界与依赖方向；  
  - 关键不变式与约束。

当对积分模型进行重大调整（新增类型、改变生命周期、修改过期/幂等策略等）时，应同时更新本文件与上述相关文档。
