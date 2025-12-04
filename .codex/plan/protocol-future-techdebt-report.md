# 协议 / 未来演进 / 技术债 审查报告（结构化版本）

> 报告目标：为团队提供一份「协议 / 未来演进 / 技术债」的单一事实来源，从外部协议（API / Actions / Job）与内部协议（domain/service/hooks/UI）两个层次出发，评估当前实现的一致性与可演进性，并给出 Top 级别的技术债矩阵。

---

## 1. 协议地图（Protocol Map）

本节从「外部协议 → 内部协议」两个层次梳理当前仓库的主要协议形态及约束。

### 1.1 外部协议地图：HTTP API / Server Actions / Job

**1）统一 Envelope 与错误模型**
- 规范来源：`docs/api-reference.md` + `docs/error-codes.md` + `docs/error-logging.md`。
- 约定：除流式 `POST /api/chat` 外，所有 `/api/*` 与 Server Actions 统一使用 JSON Envelope：
  - 成功：`{ success: true, data: {...}, ... }`
  - 失败：`{ success: false, error, code?, retryable? }`
- 错误码全集：`src/lib/server/error-codes.ts` 与 `docs/error-codes.md` 保持同步，前端通过 `getDomainErrorMessage` + `domain-error-ui-registry.ts` 消费。

**2）HTTP API Routes（示例）**
- AI / Credits 相关：
  - `/api/chat`：流式 SSE，使用 usecase `executeAiChatWithBilling` 扣费；错误通过 `AI_CHAT_*` + `CREDITS_*` / `AI_CONTENT_*` 系列码体现（`docs/ai-lifecycle.md`）。
  - `/api/analyze-content`：`span: api.ai.text.analyze`，严格 JSON 校验与 URL 校验；错误通过 `AI_CONTENT_*` 系列码暴露（`docs/ai-lifecycle.md` + `docs/error-logging.md`）。
  - `/api/generate-images`：`span: api.ai.image.generate`，多 provider 聚合；错误通过 `AI_IMAGE_*` 系列码暴露，并根据 code 映射到 4xx/5xx/504/502（`docs/api-reference.md`）。
- Storage / 搜索 / Cron：
  - `/api/storage/upload`：`span: api.storage.upload`，错误码来自 `STORAGE_*` 系列，前端通过 `useStorageErrorUi` 消费（`docs/storage-lifecycle.md`）。
  - `/api/search`：`span: api.docs.search`，内部调用 Fumadocs 搜索 API，统一包装为 JSON Envelope；错误通过 `DOCS_SEARCH_FAILED` 暴露，并在 `docs/error-logging.md` 标记为“✅ 已符合”。
  - `/api/distribute-credits`：`span: api.credits.distribute`，Basic Auth 保护的内部 Job 入口，错误码 `CRON_BASIC_AUTH_MISCONFIGURED` / `AUTH_UNAUTHORIZED` / `CREDITS_DISTRIBUTION_FAILED`（`docs/env-and-ops.md` + `docs/credits-lifecycle.md`）。
- Webhook：
  - `/api/webhooks/stripe`：`span: api.webhooks.stripe`，只接受 POST，使用 `handleStripeWebhook` 验证签名并委托 `StripeWebhookHandler`，错误码包括 `PAYMENT_SECURITY_VIOLATION` 与通用 `UNEXPECTED_ERROR`（`docs/payment-lifecycle.md`）。

**3）Server Actions（safe-action 客户端）**
- 规范来源：`docs/api-reference.md` 的 Actions 表 + `docs/error-logging.md` 的 safe-action 小节。
- 典型动作：`create-checkout-session` / `create-credit-checkout-session` / `create-customer-portal-session` / `consume-credits` / newsletter 订阅 / captcha 验证等。
- 协议约束：
  - 所有 Actions 通过 `createSafeActionClient` 包裹，错误统一经 `handleServerError` 封装 Envelope；
  - DomainError → `{ success: false, error, code, retryable }`；普通 Error → `{ success: false, error }`；
  - 前端调用统一使用 `unwrapEnvelopeOrThrowDomainError` 在 hooks 中解包。

**4）内部 Job / Cron 协议**
- 文档约束：`docs/env-and-ops.md` + `docs/credits-lifecycle.md`。
- 代表：积分分发 Job：
  - HTTP 入口：`/api/distribute-credits`（Basic Auth + Envelope）；
  - Usecase 层：`src/lib/server/usecases/distribute-credits-job.ts`，负责编排分发与日志；
  - Domain 层：`src/credits/distribute.ts` + `CreditDistributionService` 调度分发策略；
  - 错误码：`CREDITS_DISTRIBUTION_FAILED` / `CRON_BASIC_AUTH_MISCONFIGURED` 等，日志 span 为 `api.credits.distribute` + `credits.distribution`。

**小结（外部协议）**
- 优点：
  - Envelope / DomainError / ErrorCodes 三件套在 HTTP API + Server Actions 层基本落地，并有完整文档支撑（`docs/api-reference.md` + `docs/error-logging.md`）。
  - 核心高风险入口（Stripe webhook、Credits 分发、AI 调用、Storage 上传）均有明确的 span 与错误码规范。
- 风险点：
  - 新增 API/Actions 若绕过统一 Envelope 或 ErrorCodes，将破坏前端 error UI 与日志聚合。
  - Job/Cron 协议主要靠文档与单路由（`/api/distribute-credits`）体现，缺少更多任务的统一模式。

---

### 1.2 内部协议地图：Domain / Service / Hooks / UI

**1）Credits ↔ Billing ↔ Payment**
- 文档来源：`docs/credits-lifecycle.md` + `docs/payment-lifecycle.md` + `docs/feature-modules.md`。
- 协议要点：
  - Credits：由 `CreditLedgerDomainService` + `CreditLedgerService`（gateway）提供稳定接口：`addCredits`, `consumeCredits`, `addSubscriptionCredits`, `addLifetimeMonthlyCredits` 等。
  - Billing：`DefaultBillingService` 基于 `PlanPolicy` + `CreditsGateway` 协调 plan/price 与 Credits 发放；仅通过窄接口依赖 PaymentProvider（默认 `StripePaymentAdapter`）。
  - Payment：通过 `PaymentProvider` 抽象（`StripePaymentAdapter` 实现）暴露 `createCheckout`/`createCreditCheckout`/`createCustomerPortal`/`getSubscriptions` 等能力，不允许其他模块直接依赖 Stripe SDK。
- 内部协议：
  - `BillingService` ←→ `PaymentProvider`：以业务语义字段（planId/priceId/metadata）传递信息，而不是暴露 Stripe 原始类型；
  - `BillingService` ←→ `CreditsGateway`：仅以领域结构（credits amount / periodKey / reason）交互，屏蔽账本表结构；
  - `MembershipService`：作为终身会员域的网关，与 Billing/Credits 通过 `grantLifetimeMembership` 等稳定接口协作。

**2）AI ↔ Credits / Usage / Billing**
- 文档来源：`docs/ai-lifecycle.md`。
- 协议要点：
  - AI usecases：`executeAiChatWithBilling` / `analyzeWebContentWithCredits` / `generateImageWithCredits`；对外暴露 `{ status, response }`，不依赖 Next.js 请求对象。
  - 计费规则：`DefaultAiBillingPolicy` + `billing-config.ts` 以「per-feature billing rules」方式对接 `websiteConfig.ai.billing.*`，usecase 仅通过 `get*BillingRule` 访问。
  - 用量统计：`incrementAiUsageAndCheckWithinFreeQuota` 以 `{ userId, feature, periodKey }` 为主键维护 `ai_usage`，对 usecase 抽象为「是否仍在免费额度内 + 目前累计用量」。
  - Credits 扣费：当超出免费额度时，usecase 调用 `consumeCredits` 并以明确的 description 标记用途，错误统一通过 `CREDITS_*` DomainError 暴露。

**3）Storage / Newsletter / Mail / Notification**
- 文档来源：`docs/storage-lifecycle.md` + `docs/feature-modules.md`。
- 协议要点：
  - Storage：`StorageClient` + provider 抽象（如 `s3.ts`），以 `{ key, url, contentType, size }` 等通用字段作为接口；错误统一映射至 `STORAGE_*` 错误码。
  - Newsletter：Server Actions（subscribe/unsubscribe/status）使用 DomainError + ErrorCodes 暴露异常；UI 通过 `useNewsletter` hook 统一消费。
  - Mail / Notification：通过领域服务封装外部 provider（如邮件服务、通知推送），错误会转成 DomainError 并记入日志（`mail.*` / `notification.*` spans）。

**4）Hooks / UI ↔ Envelope / DomainError**
- 规范来源：`docs/error-logging.md` + `docs/feature-modules.md`。
- 典型模式：
  - Hooks：`use-credits.ts` / `use-payment.ts` / `use-newsletter.ts` / `use-users.ts` 等，通过 `unwrapEnvelopeOrThrowDomainError` 解包后，依赖 `DomainErrorLike` 的 `code/retryable` 进行错误处理；
  - 领域错误 UI：`domain-error-ui-registry.ts` + `useAuthErrorHandler` + `useCreditsErrorUi` + `useAiErrorUi` + `useStorageErrorUi` 等，避免在组件中散落 `if (code === ...)`；
  - UI 组件只依赖 hook 暴露的「成功数据 + 通用 error handler」，不直接感知 DomainError 实现细节。

**小结（内部协议）**
- 优点：
  - Credits / Billing / Payment / AI 之间的接口基本通过窄接口抽象完成，文档与实现高度对齐。
  - hooks + error UI registry 建立起「Envelope → DomainError → UI」的一致协议。
- 风险点：
  - Billing / Payment / Credits 的组合根（env/config/依赖注入）仍带有较多环境耦合，未来在多租户、多 Provider、多计划扩展时可能形成瓶颈。
  - 部分内部协议在代码里有 TODO 或隐含约定（如 docs Source 的 baseUrl 配置），需要通过测试或 schema 固化。

---

## 2. 未来演进场景评估（Future Evolution Scenarios）

本节从典型演进场景角度评估当前架构的支撑度与阻塞点。

### 2.1 场景 A：引入第二个支付 Provider / 多租户 Stripe Key

**现状**
- Payment 模块已经通过 `PaymentProvider` 接口与 `StripePaymentAdapter` 实现初步解耦（`docs/payment-lifecycle.md`）。
- 组合根 `getPaymentProvider` / `handleStripeWebhook` 仍强依赖 `serverEnv`（单组 Stripe key）与默认仓储实现。

**演进目标**
- 支持：
  - 按租户/工作区/环境切换支付 Provider；
  - 为不同租户配置不同 Stripe key 或其它 Provider（如 Paddle/Adyen）。

**当前阻塞点**
- Stripe 相关组合根仍然在单一入口中组装全部依赖，缺乏针对「租户 + Region」的配置分发层。
- Webhook 处理逻辑默认假定「单 Stripe 实例」，对多实例/多 Provider 的路由与签名校验没有抽象。

**建议方向**
- 引入 `PaymentProviderFactory`（或类似组合根）：
  - 输入：tenantId/region/env；输出：`PaymentProvider` + `BillingService` + `StripeWebhookHandler` 对应实例。
  - 在 API/Actions/Webhook 入口只依赖 factory 接口，而非具体 Stripe 实现。
- 在 `docs/payment-lifecycle.md` 中补充「多 Provider / 多租户」小节，明确配置与路由策略。

---

### 2.2 场景 B：按 Plan / Region 调整 AI 计费与 Credits 策略

**现状**
- AI 计费规则由 `DefaultAiBillingPolicy` + `billing-config.ts` 实现，主要依据 `websiteConfig.ai.billing` 给出的默认配置（`docs/ai-lifecycle.md`）。
- Credits 计费策略主要停留在「每 feature 固定收费 + 免费额度」，尚未区分 plan/region/tier。

**演进目标**
- 不同订阅计划或区域使用不同的：
  - 免费调用次数（`freeCallsPerPeriod`）；
  - 单次调用消耗的积分（`creditsPerCall`）；
  - 单位周期长度（例如按月/按周/按季）。

**当前阻塞点**
- `billing-config.ts` 中的规则基本是常量映射，未显式引入 plan/region 维度。
- `DefaultAiBillingPolicy` 的配置来源与 Credits/Billing 的 PlanPolicy 仍是分离的，缺少统一的 plan 定义。

**建议方向**
- 将 AI 计费配置视为 PlanPolicy 的一个子视图：
  - 在 `docs/credits-lifecycle.md` 与 `docs/ai-lifecycle.md` 中统一说明「plan → credits → AI billing」的映射关系。
  - 在实现层引入 `AiBillingRuleRepository` 或扩展现有 PlanPolicy，以 plan/region 为输入生成 per-feature 计费规则。
- 测试上可通过少量 table-driven 测试验证「不同 plan/region + feature → credits 消耗」是否符合预期。

---

### 2.3 场景 C：扩展 Credits 生命周期（多来源、多过期策略、多渠道发放）

**现状**
- Credits 生命周期已经覆盖：注册赠送、订阅续费、Lifetime 月度发放、分发 Job、一次性套餐购买等（`docs/credits-lifecycle.md`）。
- 账本采用「余额 + 明细 + periodKey」的模型，支持过期与幂等控制。

**演进目标**
- 新增：
  - 更复杂的过期策略（按来源/用途定制）；
  - 运维/客服后台执行的一次性调整（手动加减积分）；
  - 不同来源间差异化消费策略（例如优先用活动赠送、再用订阅）
。

**当前阻塞点**
- 过期策略与分发 Job 的配置仍以代码常量为主，缺少配置化/策略装配层。
- 人工调整的流程与审计日志未形成完整协议（目前主要通过领域服务 API 内隐约定）。

**建议方向**
- 使用策略模式或配置驱动的方式，将「来源 → 过期策略/消费优先级」抽象为表驱动配置。
- 在 `docs/credits-lifecycle.md` 中补充「运营/客服调整」与「多渠道发放」的生命周期说明，并与 Job/Actions/API 对应起来。

---

### 2.4 场景 D：扩展文档/营销页面 Source 与多语言路由

**现状**
- Fumadocs Source 通过 `src/lib/source.ts` 暴露多个源：`source`（docs）、`changelogSource`、`pagesSource`、`authorSource`、`categorySource`、`blogSource`。
- `pagesSource` 留有 TODO：「how to set the baseUrl for pages?」，表明当前多语言路由或路径生成存在不确定性。

**演进目标**
- 支持：
  - 多语言 docs/marketing 页面的一致路由策略（`/[locale]/docs/*`、`/[locale]/pages/*` 等）；
  - 可扩展的文档源（新增产品文档、知识库等）。

**当前阻塞点**
- `pagesSource` 的 baseUrl 未被严格约束；
- Docs/Marketing 路由与 Fumadocs Source 之间缺少显式契约（例如没有集中声明「source key ↔ route 前缀」关系）。

**建议方向**
- 在 `docs/architecture-overview.md` 或文档子文档中补充「Docs/Marketing 路由与 Source 映射表」；
- 在 `src/lib/source.ts` 中消除 TODO，通过常量或配置文件确定 baseUrl，并为 key/路径映射补充小范围测试。

---

### 2.5 场景 E：协议与错误模型的自动化守护（CI/Rule 层）

**现状**
- Envelope 与错误模型的规范主要通过文档（`docs/error-logging.md`、`docs/api-reference.md`）与局部测试守护；
- 新增 `/api/*` 或 Actions 时，协议一致性 largely 依赖 code review。

**演进目标**
- 在 CI 层提供自动化检查：
  - 新增 API Route 是否在 docs 中登记；
  - 是否返回标准 Envelope；
  - 是否使用 `DomainError` 与 ErrorCodes；
  - 是否配置合理的 span 与日志上下文。

**当前阻塞点**
- 缺少统一的脚本扫描 `src/app/api` 与 `src/actions`，并与 `docs/api-reference.md`/`docs/error-logging.md` 对比；
- ErrorCodes 与前端 error UI registry 的映射关系主要靠人工维护。

**建议方向**
- 在 `.codex/plan` 下新增或扩展自动化检查计划，编写小工具：
  - 扫描路由文件抽取 `NextResponse.json` 模式，检查是否包含 `success` 字段；
  - 汇总所有 ErrorCodes 在前端 registry 及 docs 中的使用情况，检测未使用/未文档化的错误码。

---

## 3. 技术债矩阵（Top ~20）

> 本表聚焦对「协议一致性 + 未来演进能力」影响最大的技术债项，按照 P0/P1/P2 粗略排序，并给出人日级别估算。部分条目在旧版本报告中已有描述，此处以新的结构化视角重新整理。

| # | 领域/维度 | 问题描述 | 证据 | 优先级 | 估算 | 备注 |
| - | -------- | -------- | ---- | ------ | ---- | ---- |
| 1 | 协议一致性 / API | 新增 `/api/*` 路由缺少自动化 Envelope 校验，依赖人工 review | `docs/error-logging.md` 仅给出模式示例；`src/app/api/*` 中 Envelope 实现依靠手写 | P1 | 2d | 建议编写脚本扫描 route 文件，检测缺失 `success` 字段或非标准错误结构，并在 CI 中执行 |「✅ 已通过 scripts/check-protocol-and-errors.ts → checkApiEnvelopes 实现首版静态守护（检查包含 NextResponse.json 的 route 是否出现 success 属性）；后续如需更精细的 per-call 检查可开 P2 子任务。」
| 3 | API ↔ 文档 对齐 | 部分 API/Job 未在 `docs/api-reference.md`/`docs/env-and-ops.md` 完整登记（特别是内部 Job 或实验性接口） | 对比 `src/app/api/*` 与 docs 章节存在遗漏 | P1 | 1.5d | 建议建立「路由清单与文档清单」对照表，新增/删除路由时同步更新文档 |
| 4 | ErrorCodes ↔ 文档/前端 映射 | ErrorCodes 中部分码在 docs 或前端 registry 中缺少对应条目，影响观测与 UI 一致性 | `src/lib/server/error-codes.ts` vs `docs/error-codes.md` vs `domain-error-ui-registry.ts` | P1 | 2d | 建议编写脚本列出未文档化或未使用的错误码，并在 docs 中补齐或清理 |「✅ checkErrorCodesDocumented + checkErrorUiRegistry 保证 ErrorCodes 与文档/前端 UI registry 一致，并通过 checkDomainErrorCodes 补上 DomainError 引用守护。」
| 2 | 协议一致性 / Actions | safe-action 规范未有静态守护，新 Actions 仍可能绕过 DomainError 模型 | `src/actions/*` 当前已统一，但缺少 lint/规则约束；`docs/error-logging.md` 仅描述推荐模式 | P1 | 1.5d | 可通过 AST/regex 扫描，确保所有 Actions 通过 `createSafeActionClient` 并在错误时返回 `code`/`retryable`，与架构体检报告 P1「收敛 action 层错误处理模式」保持一致 |「✅ 已通过 checkSafeActions（强制 safe-action）+ checkActionErrorEnvelopes（无 code 的 { success: false } 给出 warning）实现首版静态守护；✅ 已在 `src/lib/safe-action.ts` 中引入 `withActionErrorBoundary` helper，并将部分 Credits/Billing/Newsletter Actions（如 `get-credit-balance`、`get-credit-overview`、`consume-credits`、`create-checkout-session`、`create-credit-checkout-session`、`get-active-subscription`、`check-newsletter-status`、`subscribe-newsletter`）迁移到统一的 DomainError 包装模式。」
| 5 | AI 计费配置缺少 plan/region 维度 | AI 计费规则虽已通过 `AiBillingPolicy` + `AiConfigProvider` 集中从 `websiteConfig.ai.billing` 解析，但默认策略仍忽略 plan/region，未与 Billing PlanPolicy 显式对齐 | `src/ai/billing-policy.ts` + `src/ai/ai-config-provider.ts` + `docs/ai-lifecycle.md` | P1 | 2d | 与架构体检报告 P0「抽象 AI 计费策略注入接口」属于同一类工作；当前 ConfigProvider/Policy 已就绪，下一步应通过 `AiBillingRuleRepository` 或扩展 PlanPolicy，将 plan/region 纳入规则生成入口 |
| 6 | Payment 多 Provider / 多租户 支撑不足 | 已引入 `PaymentProviderFactory` 集中 Provider 选择逻辑，但当前仅构造单一 `StripePaymentAdapter`，Billing 组合根与多租户/多 Provider wiring 仍未落地 | `docs/payment-lifecycle.md` + `src/payment/provider-factory.ts` + `src/payment/services/stripe-payment-*` | P1 | 3d | 与架构体检报告 P1「为 payment / AI / mail 引入轻量级配置 provider」配套；Config/Factory 层已到位，后续需要实现第二个 Provider（如 Creem）、将 Billing 显式接入 factory，并在需要时按 tenant/region 选择 Provider |
| 7 | Credits 过期/来源 策略配置硬编码 | Credits 过期/优先级策略主要由领域常量控制，缺少策略/配置层 | `docs/credits-lifecycle.md` + `src/credits/domain/*` | P2 | 3d | 将「来源 → 过期/消费规则」抽象为配置表，方便未来扩展运营/活动场景 |
| 8 | 运维/客服人工调整流程协议缺失 | 人工加减积分/修正账本的流程未在文档与 API 层形成统一协议 | `docs/credits-lifecycle.md` 提到但未细化；对应 API/Actions 分散 | P2 | 2d | 设计统一的 admin API/Actions 与审计日志格式，确保人工调整可追踪 |
| 9 | Docs/Marketing Source baseUrl TODO 未关闭 | `pagesSource` baseUrl TODO 反映 docs/marketing 路由契约不稳定 | `src/lib/source.ts:54` | P2 | 1d | 明确 docs/marketing 的路由前缀，在代码与 docs 中同时固化，并增加一两个 e2e 用例 |
| 10 | 文档 Source 与路由映射缺乏集中声明 | Fumadocs Source key 与实际路由前缀关系散落在代码中 | `src/lib/source.ts` + `src/app/docs/*` | P2 | 1.5d | 在 docs 中增加「Source ↔ Route」映射表，并在实现层用常量/配置统一管理 |
| 11 | 协议与错误模型未有 CI 级守护 | Envelope/错误码/spans 主要靠人工检查 | `docs/error-logging.md` + CI 配置 | P1 | 2d | 结合 #1/#2/#4/#15，通过一组脚本在 CI 中对协议/错误模型做基础检查 |「✅ 首版静态守护已通过 pnpm check:protocol 落地；后续工作主要是 CI 集成 + 扩展 span 检查（参见 #12）。」
| 11a | Stripe webhook UnexpectedError 的 HTTP 状态与 retryable 语义不完全一致 | `/api/webhooks/stripe` 对非 DomainError 返回 `retryable: true` 但 HTTP 状态固定 400，概念上与「可重试＝5xx」约定不完全一致 | `src/app/api/webhooks/stripe/route.ts` + `docs/error-logging.md` | P2 | 1d | 在下一次 Payment/Webhook 改动时，将 UnexpectedError 的 HTTP 状态调整为 5xx（如 500），或在文档中明确说明 Webhook 路径的特殊约定，确保 retryable 语义与状态码对齐 |
| 11b | Credits 套餐 webhook 对缺失 metadata 的情况静默处理 | `onCreditPurchase` 在 `userId/packageId/credits` 缺失时直接 return 且不记录错误或告警，可能导致已收费但未发积分的隐形问题 | `src/payment/services/webhook-handler.ts` + `docs/credits-lifecycle.md` + `docs/payment-lifecycle.md` | P1 | 2d | 至少对缺失 metadata 的场景记录 warn/error 级结构化日志（含 sessionId/metadata），并视需要抛出非 retryable DomainError（例如复用 `CreditsInvalidPayload`），使该类问题可观测且可告警 |
| 11c | Webhook 入口对「缺 payload/signature」统一使用 UNEXPECTED_ERROR 且不打日志 | `/api/webhooks/stripe` 在缺少 payload/signature 时直接返回 `UNEXPECTED_ERROR` + `retryable: false`，但未记录日志，也未区分安全/配置类错误 | `src/app/api/webhooks/stripe/route.ts` + `docs/payment-lifecycle.md` | P2 | 1.5d | 引入更精确的错误码（或复用 `PAYMENT_SECURITY_VIOLATION`），至少记录 error 级日志，并在文档中说明「缺 payload/signature」属于安全/配置问题，以便监控与排查 |
| 11d | StripeCheckoutService 对 credit package 缺失仍抛通用 Error 而非 DomainError | `createCreditCheckout` 在 Action 层已经用 `CreditsInvalidPayload` 兜底，但 Provider 层遇到 package 缺失仍抛通用 Error，最终被包装为 UnexpectedError，错误语义不够清晰 | `src/payment/services/stripe-checkout-service.ts` + `src/credits/domain/errors.ts` + `docs/error-codes.md` | P2 | 1d | 在 Provider 层统一使用 `InvalidCreditPayloadError`（`CREDITS_INVALID_PAYLOAD`），或在下一轮重构中将该路径与 Action 层的 DomainError 策略对齐，减少「配置错误」被归类为 UnexpectedError 的情况 |
| 12 | Error Logging 表与实际 span 使用可能漂移 | `docs/error-logging.md` 中 span 汇总表需手动维护 | `docs/error-logging.md` vs `src/lib/server/logger.ts` 使用情况 | P2 | 1.5d | 脚本扫描代码中的 span 常量并与 docs 表对比，提示未登记或过期的 span |「⏳ 脚本尚未覆盖 span ↔ docs 对齐，后续在现有脚本基础上扩展」。
| 13 | Membership/Payment/Credits 调用链复杂度较高 | 终身会员、订阅续费、Credits 发放之间的调用链依赖多个组合根与仓储 | `docs/credits-lifecycle.md` + `docs/payment-lifecycle.md` + 源码 | P2 | 3d | 通过 usecase 进一步收口公共调用序列，减少跨模块散落的组合逻辑 |
| 14 | Storage 错误模型与前端 UI 一致性依赖手动维护 | Storage 客户端/Hook 与错误码的映射主要靠约定 | `docs/storage-lifecycle.md` + `useStorageErrorUi` | P2 | 1.5d | 类似 AI/Credits，引入针对 Storage 的小型 error UI 规则与测试，保证 code ↔ 行为一致 |
| 15 | ErrorCodes 扩展策略未完全规范化 | 新领域引入错误码时的命名/分类/文档流程缺少 checklist | `docs/error-codes.md` + `.codex/plan/error-codes-expansion.md` | P2 | 1d | 在 docs/plan 中补充「新增错误码 checklist」，并在 PR 模板中引用 |
| 16 | tests 覆盖协议边界仍不均衡 | 部分关键协议（例如某些 Job/API）的回归测试不够完整 | `docs/testing-strategy.md` + 测试目录 | P2 | 3d | 根据本报告所列高风险协议，为其补充最小 e2e/route 级测试 |
| 17 | Credits 分发 Job 失败路径的监控与报警未完全闭环 | 错误码存在，但从日志到报警与重试策略尚未完全固化 | `docs/credits-lifecycle.md` + `docs/error-logging.md` | P2 | 2d | 在 ops 文档中补充基于 span/errorCode 的报警建议，并在 Job 配置中使用 |
| 18 | AI 免费额度与付费额度的 UI 表达尚待统一 | 前端对「免费额度 vs 积分扣费」的展示与文案分散在各页面 | `docs/ai-lifecycle.md` + UI 源码 | P2 | 2d | 设计统一的 UX 模式与 i18n key 集合，保证 AI 计费体验一致 |
| 19 | env/config 与协议行为的耦合点文档化不充分 | 部分行为对 env/config 高度敏感（如 Stripe/Firecrawl/Storage），但文档散在 | `docs/env-and-ops.md` + 各 lifecycle 文档 | P2 | 2d | 建议在 env 文档中增加「env → 协议行为」映射表，以及缺失 env 时的错误码约定 |
| 20 | 协议/技术债报告与 `.codex/plan` 同步机制依赖人工 | 本报告、其他报告与 plan 文档之间的一致性依赖手动维护 | `docs/governance-index.md` + `.codex/plan/*` | P2 | 1d | 在治理索引中增加「当修改协议/错误码时必须同步的文档清单」，并在 PR 模板中引用 |

> 优先级定义：P0（立即影响线上）、P1（短期内需修复）、P2（中期优化项）。估算为粗略人日，主要用于排序和容量规划。

---

## 4. 建议与下一步

基于上述协议地图、未来演进场景与技术债矩阵，建议后续工作按以下顺序推进：

1. **建立协议与错误模型的自动化守护（短�� P1）**
   - 聚焦技术债 #1/#2/#4/#11/#12，编写一组轻量脚本：
     - 扫描 `/api/*` 与 `src/actions/*` 检查 Envelope 一致性；
     - 对比 ErrorCodes、docs 与前端 registry 的映射关系；
     - 校验 span 使用与 `docs/error-logging.md` 的表是否一致。
   - 将这些检查接入 CI，作为新协议/错误模型变更的安全网。

2. **明确 Payment / AI / Credits 的扩展边界（中期 P2）**
   - 针对场景 A/B/C，分别在 `docs/payment-lifecycle.md`、`docs/ai-lifecycle.md`、`docs/credits-lifecycle.md` 中补充「多 Provider / plan/region / 多来源」扩展章节。
   - 在实现层引入必要的 factory/策略/配置抽象，确保未来新增 Provider/plan/region 时不破坏现有协议。

3. **巩固 Docs/Marketing 与 Source 协议（中期 P2）**
   - 关闭 `pagesSource` baseUrl TODO，并在 docs 中固化「Source ↔ Route」映射。
   - 通过有限的 e2e 测试验证多语言路由与 Source 一致性，降低未来重构/迁移风险。

4. **对照本报告持续更新 `.codex/plan` 与 `docs/governance-index.md`**
   - 当落实上述改动时，在 `.codex/plan` 下拆分具体重构任务，并在 `docs/governance-index.md` 中保持对本报告的引用与说明同步更新。
   - 后续若协议/错误模型发生重大变更，可在本报告基础上增量更新，而不是另起新报告，以维持「单一事实来源」的定位。
