# Feature Modules 架构概览

本篇文档基于当前代码实现，从「特性模块」视角（而非物理目录）对项目架构做一个高层概览，帮助你快速理解核心 SaaS 能力在路由、Actions、领域服务与基础设施之间的调用关系。

> 目录结构与基础约定请参考根目录 `README.md`，本文不重复列出所有目录，仅聚焦关键特性模块。

---

## 1. 整体视图

从宏观上看，项目遵循「UI / Routing → Actions / API → 领域服务 → 基础设施」的分层思路：

- UI / Routing：`src/app`（App Router）、`src/components`（UI 组件）
- Actions / API：
  - Server Actions：`src/actions/*`
  - API Routes：`src/app/api/*`
- 领域服务 / 模块：
  - Auth：`src/lib/auth*`, `src/lib/auth-domain.ts`, `src/lib/user-lifecycle/*`
  - Payment：`src/payment/*`
  - Credits：`src/credits/*`
  - AI（文本/图片）：`src/ai/*`
  - 通知、Newsletter、存储：`src/notification/*`, `src/newsletter/*`, `src/storage/*`
- 基础设施：
  - 数据库：`src/db/*`（Drizzle schema + migrations）
  - Env / Config：`src/env/*`, `src/config/*`
  - 日志：`src/lib/server/logger.ts`, `src/lib/logger.ts`

下面按「特性模块」展开。

---

## 2. Auth 模块

### 2.1 主要职责

- 用户认证与会话管理（better-auth）
- 登录/注册/重置密码/邮箱验证流程
- 用户生命周期钩子（注册后赠送积分、订阅 Newsletter 等）

### 2.2 关键文件

- 配置与集成：
  - `src/lib/auth.ts`：better-auth 主配置（providers、session、databaseHooks、plugins 等）
  - `src/lib/auth-domain.ts`：封装与业务相关的 Auth 领域逻辑
  - `src/lib/auth-types.ts` / `src/lib/auth-errors.ts`：用户类型与认证错误
- 路由 & UI：
  - `src/app/[locale]/auth/*`：登录/注册/忘记密码/重置密码页面
  - `src/components/auth/*`：登录表单等 UI 组件（按需补）
- 用户生命周期：
  - `src/lib/user-lifecycle/*`：UserLifecycleManager + Hooks（积分赠送、newsletter 等）
  - `src/lib/user-lifecycle/__tests__/*`：生命周期管理器测试

### 2.3 典型请求流：用户注册

1. 用户访问 `[locale]/auth/register` 页面，提交注册表单。
2. 表单组件调用 Auth SDK（better-auth）完成注册流程。
3. better-auth 在数据库创建用户记录后，触发：
   - `databaseHooks.user.create.after` → `handleAuthUserCreated(...)`。
4. `handleAuthUserCreated` 委托给 `UserLifecycleManager`：
   - 调用注册赠送积分 hook（credits 模块）
   - 调用 newsletter 订阅 hook（newsletter 模块）
5. 相关副作用（积分记录、订阅记录）通过各自的服务模块完成。

模块边界要点：

- Auth 模块本身不直接持有业务状态（如积分），而是通过 user-lifecycle hooks 与 credits/newsletter 等模块进行集成。
- UI 层只使用 auth client / hooks，不直接操作 user-lifecycle。

---

## 3. Payment 模块

### 3.1 主要职责

- 封装 Stripe 支付（订阅 / 一次性 / Credits 套餐）
- 提供统一的领域服务接口给 Actions / 路由使用
- 处理 Stripe webhook 事件并驱动本地 Payment / Credits 状态变更

### 3.2 关键文件

- 领域与接口：
  - `src/payment/index.ts`：对外导出的 payment 入口（创建 checkout、customer portal、订阅查询等）
  - `src/payment/types.ts`：支付相关类型（PaymentTypes、PlanIntervals 等）
  - `src/payment/services/*`：领域服务（`stripe-payment-service.ts`, `stripe-checkout-service.ts`, `webhook-handler.ts` 等）
  - `src/payment/data-access/*`：访问 `payment` / `stripe_event` 等表的仓储
- 前端 & Actions：
  - `src/actions/create-checkout-session.ts`
  - `src/actions/create-credit-checkout-session.ts`
  - `src/actions/create-customer-portal-session.ts`
  - `src/components/payment/*`：CheckoutButton / CustomerPortalButton / PricingTable 等
- Webhook：
  - `src/app/api/webhooks/stripe/route.ts`：HTTP 入口，调用 `handleStripeWebhook`（`src/lib/server/stripe-webhook.ts`），并使用 `DomainError` + 结构化 logger。

### 3.3 典型请求流：订阅/credits 购买

1. UI 层（`PricingTable`、`CreditCheckoutButton` 等）触发：
   - `createCheckoutAction` 或 `createCreditCheckoutSession`。
2. Actions：
   - 使用 `userActionClient` 校验登录，解析 planId/priceId/metadata。
   - 调用 `payment` 模块的创建 checkout 领域服务。
3. Payment 领域服务：
   - 调用 Stripe SDK 创建 checkout session；
   - 在本地 `payment` 表中记录 pending 付款信息。
4. Stripe 完成支付后调用 webhook：
   - `/api/webhooks/stripe` → `handleWebhookEvent`；
   - handler 读取事件 payload，进行幂等检查（`stripe_event` 表），更新 `payment` 表状态；
   - 若是订阅/credits 相关事件，进一步调用 credits 模块（发放积分）。

模块边界要点：

- Payment 模块是 Stripe 的唯一接入点；UI 或其他模块不得直接操作 Stripe SDK。
- Credits 的发放与支付结果的映射逻辑位于 Payment / Credits 两模块之间，通过明确的服务接口协作。

---

## 4. Credits 积分模块

### 4.1 主要职责

- 管理用户积分余额、交易记录与过期处理
- 支持多种积分来源：注册赠送、订阅周期赠送、充值、人工调整等
- 提供一致的消费接口，支持 FIFO 扣减与过期结算

### 4.2 关键文件

- 领域 & 数据访问：
  - `src/credits/domain/*`：`CreditLedgerDomainService`、领域错误（`InvalidCreditPayloadError`, `InsufficientCreditsError` 等）
  - `src/credits/data-access/*`：`CreditLedgerRepository` + Drizzle 类型
  - `src/credits/services/*`：`credit-ledger-service.ts`（对外网关）、`transaction-context.ts`（事务上下文）
  - `src/credits/config.ts`：Credits 配置适配器，从 `websiteConfig` / price plan 中抽取积分相关配置，供领域服务消费
  - `src/credits/utils/period-key.ts`：periodKey 计算与约束（支持月度/周期性积分）
  - `src/db/schema.ts`：`userCredit` / `creditTransaction` 表与约束定义
- 服务入口：
  - `src/credits/credits.ts`：导出 `addCredits`, `consumeCredits`, `addSubscriptionCredits` 等服务函数
  - `src/credits/server.ts`：服务器侧 helpers（如在任务/脚本中调用）
- Actions & Hooks & UI：
  - `src/actions/get-credit-balance.ts`, `get-credit-stats.ts`, `get-credit-transactions.ts`, `consume-credits.ts`
  - `src/hooks/use-credits.ts`：React Query hooks + auth 错误处理（`useAuthErrorHandler`）
  - `src/app/[locale]/(protected)/settings/credits/page.tsx` + `src/components/settings/credits/*`

### 4.3 典型请求流：积分消费

1. UI：例如 `ConsumeCreditsCard`（测试组件）或实际业务入口调用 `useConsumeCredits`。
2. Hook：
   - 调用 `consumeCreditsAction`；
   - 根据失败结果中的 `code` 与 `retryable` 构造 Error（附带 DomainErrorLike 信息），交给 UI 处理（toast / 跳转）。
3. Action：`consumeCreditsAction`（`src/actions/consume-credits.ts`）
   - 使用 `userActionClient` 注入当前用户；
   - 调用 `credits.consumeCredits`。
4. Domain：
   - `CreditLedgerDomainService.consumeCredits` 使用事务或已有 executor：
     - 检查余额；不足时抛 `InsufficientCreditsError`；
     - 按 FIFO 扣减 `creditTransaction.remainingAmount`，更新 `userCredit.currentCredits`；
     - 记录 usage 记录。

模块边界要点：

- Action 层只负责参数校验和用户上下文注入，所有业务规则在 domain/service 层。
- domain 层通过 DomainError 与上层通信，具体文案/i18n 由前端通过 `getDomainErrorMessage` 决定。

> 关于 Credits 从创建、发放、消费到过期的完整生命周期，以及与 Billing / Payment / Auth / Job 边界的更细致说明，可参考 `docs/credits-lifecycle.md`。  
> Credits 相关错误的前端消费统一通过 `useCreditsErrorUi`（`src/hooks/use-credits-error-ui.ts`）与 `domain-error-ui-registry.ts`，与 `docs/error-logging.md` 中的错误模型保持一致。

---

## 5. AI 模块（文本分析 / 图片生成）

### 5.1 文本分析（Web Content Analyzer）

- 主要职责：
  - 抓取网页内容（Firecrawl）
  - 调用不同模型（OpenAI / Gemini / DeepSeek / OpenRouter）进行结构化分析
  - 提供统一的前端 API 与错误模型

- 关键文件：
  - `src/ai/text/utils/analyze-content-handler.ts`：核心 orchestrator（抓取 + 调用模型 + 超时控制）
  - `src/ai/text/utils/error-handling.ts`：错误分类与 `WebContentAnalyzerError` / `logError`
  - `src/ai/text/utils/error-logging.server.ts`：服务端错误日志 helper（`logAnalyzerErrorServer`，使用 `span: 'ai.web-content-analyzer'`）
  - `src/ai/text/utils/error-logging.client.ts`：前端组件错误 helper（`logAnalyzerComponentError`），用于替代裸 `console.error` 并预留前端监控接入点
  - `src/ai/text/utils/web-content-analyzer.ts`：请求/响应类型与 schema、URL 校验
  - `src/ai/text/utils/web-content-config.*.ts`：性能与 Firecrawl 配置
  - `src/ai/text/components/use-web-content-analyzer.ts`：前端 hook（调用 `/api/analyze-content`，处理 envelope / toast / i18n）
  - `src/app/api/analyze-content/route.ts`：API 入口（鉴权、限流、request logger、JSON 验证）
  - `src/ai/billing-config.ts`：AI 计费配置（chat/analyze/generate 三类用例的每次调用消耗积分），由 use case 层消费

- 请求流：
  1. UI 调用 `useWebContentAnalyzer` → fetch `/api/analyze-content`。
  2. API route 使用 `ensureApiUser` + `enforceRateLimit` + request logger，解析 body 并构造 `AnalyzeContentHandlerInput`。
  3. `handleAnalyzeContentRequest`：
     - 校验 body → URL → Firecrawl 配置 → 抓取页面 → 调用模型 → 返回 structured data。
     - 所有错误通过 `WebContentAnalyzerError` + `logAnalyzerErrorServer` + 统一的 `code`/`retryable` 返回。

### 5.2 图片生成

- 主要职责：
  - 基于多 provider（OpenAI / Fireworks / Replicate / FAL）生成图片
  - 统一返回格式，处理超时、参数非法、provider 错误等

- 关键文件：
  - `src/app/api/generate-images/route.ts`：多 provider 聚合入口 + request logger
  - `src/ai/image/lib/*`：请求/响应类型与 provider 配置

模块边界要点：

- AI 模块中，错误模型统一通过 DomainError 子类或特定错误码实现，以便前端/日志统一消费。
- 与积分/计费的关系目前较为松散，可按产品需求在后续 use case 层中做进一步耦合。

### 5.3 AI 免费额度策略

- 策略说明：
  - 每个用户在每个计费周期（沿用 Credits 的 periodKey，通常为月）对每个 AI 功能拥有固定数量的免费调用次数（当前默认：Chat/Text/Image 各 8 次）。
  - 超出免费调用次数后，同一功能的后续调用将按 `creditsPerCall` 从积分余额中扣费。
- 技术实现：
  - 配置层：`src/ai/billing-config.ts`
    - 为 `chat` / `analyzeContent` / `generateImage` 定义 `creditsPerCall` 与 `freeCallsPerPeriod`。
  - 使用量计数：`src/ai/usage/ai-usage-service.ts`
    - `ai_usage` 表记录 `{ userId, feature, periodKey, usedCalls }`。
    - `incrementAiUsageAndCheckWithinFreeQuota` 用于自增并判断是否仍在免费额度内。
  - Use Case 层：
    - `executeAiChatWithBilling` / `analyzeWebContentWithCredits` / `generateImageWithCredits`
      - 若在免费额度内：仅记录 usage，不调用 `consumeCredits`。
      - 若超出免费额度：调用 `consumeCredits` 扣费，可能抛出 `CREDITS_INSUFFICIENT_BALANCE`。
- 行为特性：
  - 免费调用与付费调用在领域层透明统一，API 路由与前端始终只感知 DomainError 和标准响应 envelope。
  - 极端并发下可能存在少量超额免费调用（基于简单的“读+更新”计数模式），换取实现简单性和低耦合度；如需更严格控制，可在未来改用数据库级原子自增策略。

---

## 6. 内容 & 搜索模块

### 6.1 内容（content + docs）

- `content/*`：博客、文档、页面等 MD/MDX 内容（多语言）
- `source.config.ts`：Fumadocs collections 配置（docs/changelog/pages/blog 等）
- `src/lib/docs/i18n.ts`：文档 i18n 配置
- `src/app/[locale]/docs/*`：文档路由与 layout

### 6.2 搜索

- `src/app/api/search/route.ts`：
  - 使用 Fumadocs `createI18nSearchAPI` + Orama tokenizers（含中文分词）；
  - 新增 request logger（`span: 'api.docs.search'`），记录查询长度与 locale；
  - 将请求转发给 searchAPI。

模块边界要点：

- 搜索 API 不直接访问数据库，仅基于 Fumadocs 提供的 content 索引。
- 搜索行为日志有助于后续分析搜索质量与常见查询。

---

## 7. 存储 & 上传模块

### 7.1 职责

- 对象存储统一抽象（如 S3）
- 提供安全的上传 API（大小/类型校验）

### 7.2 关键文件

- `src/storage/index.ts`：根据配置选择具体 provider，并暴露统一的 `uploadFile` 等接口
- `src/storage/provider/*`：各个存储实现（如 S3）
- `src/storage/types.ts`：`StorageError` 等错误类型
- `src/app/api/storage/upload/route.ts`：
  - 表单上传入口；
  - 校验文件存在/大小/类型；
  - 调用 `uploadFile`；
  - 使用 `createLoggerFromHeaders` 记录结构化日志。

模块边界要点：

- 业务代码不直接依赖第三方存储 SDK，只通过 `src/storage` 模块接口访问。
- 上传 API 是边界层，负责验证与错误 envelope；具体实现由 storage provider 决定。

---

## 8. 通知 / Newsletter / 批处理模块（简要）

- Newsletter：
  - `src/newsletter/*`：订阅/退订逻辑；
  - 部分行为通过 user-lifecycle hooks 在用户注册时触发。
- 通知：
  - `src/notification/*`：站内/站外通知封装（如邮件模板、第三方服务）。
- 批处理 / Cron：
  - `src/app/api/distribute-credits/route.ts`：通过 Basic Auth 保护的积分分发任务入口，供外部 Cron 触发；
  - `src/credits/expiry-job.ts`：过期积分处理逻辑；
  - 全部操作通过 credits / payment 领域服务完成，API 路由只作为触发器。

---

## 9. Use Case 层（server usecases）

为避免在 API Route / Actions 中堆积编排逻辑，同时保持领域服务可复用，本项目引入了轻量级的 Use Case Service 层：

- 位置：`src/lib/server/usecases/*`
- 典型用例：
  - `execute-ai-chat-with-billing.ts`：
    - `executeAiChatWithBilling({ userId, messages, model, webSearch, requiredCredits? })`
    - 先通过 Credits 模块扣除本次调用所需积分（默认 1），不足时抛出 `CREDITS_INSUFFICIENT_BALANCE`（DomainError）。
    - 然后调用 `streamText` 生成 AI Chat 流，返回 `ReturnType<typeof streamText>`，交由调用方决定如何转换为 HTTP 响应。
  - `analyze-web-content-with-credits.ts`：
    - `analyzeWebContentWithCredits({ userId, body, requestId, requestUrl, requiredCredits? })`
    - 先通过 Credits 模块扣除本次调用所需积分（默认 1），不足时抛出 `CREDITS_INSUFFICIENT_BALANCE`。
    - 然后调用 `handleAnalyzeContentRequest`，返回带有 `{ status, response }` 的标准结果。
  - `generate-image-with-credits.ts`：
    - `generateImageWithCredits({ userId, request, requiredCredits? })`
    - 先扣除本次图片生成所需积分（默认 1），不足时抛出 `CREDITS_INSUFFICIENT_BALANCE`。
    - 根据 provider 配置调用对应图片模型，返回标准 `GenerateImageResponse`（`success/data` 或 `success:false,error,code,retryable`）。
- 日志规范：
  - use case span 命名：`usecase.<域>.<用例>`，如：`usecase.ai.chat-with-billing`。
  - 调用方（API Route / Action）建议使用 `withLogContext({ requestId, userId })` 包裹 use case 调用：
    ```ts
    const result = await withLogContext({ requestId, userId }, () =>
      executeAiChatWithBilling({ userId, messages, model, webSearch })
    );
    ```
  - use case 内部通过 `getLogger({ span: 'usecase.ai.chat-with-billing', userId })` 获取 logger，从而继承 requestId 等上下文。
- 约束：
  - Use Case 函数不直接依赖 `NextRequest` / `NextResponse`，只接收普通参数和可选 context；仅返回领域结果或抛出 `DomainError`。
  - `{ success, error, code, retryable }` 形式的 envelope 仍由 safe-action / API Route 层统一封装。
  - Use Case 只依赖领域服务与配置适配器（如 `credits/config.ts`、`payment` 模块），不直接读取 `websiteConfig` 或 env，确保配置来源可在适配层自由替换（例如从站点配置切换到数据库配置），而不影响上层调用方式或错误模型（仍通过 DomainError 暴露）。

---

## 10. 使用建议

- 新增特性时优先考虑：
  - 是否属于现有模块（auth/payment/credits/AI/notification/storage 等）；
  - 是否需要一个独立的领域模块（如「团队/组织」、「多租户」、「审计日志」）。
- 推荐模式：
  - 路由/组件 → Actions/API → 领域服务（新模块或现有模块）→ 基础设施；
  - 领域服务通过 DomainError 与上层通信，错误模型统一；
  - 日志使用 `createLoggerFromHeaders` / `getLogger`，带上 `span`/`route`/`requestId`。

这样可以保持特性模块的清晰边界，同时让整个 SaaS 模板在扩展新能力时保持一致的结构与可观测性。 

---

## 10. Feature Modules 调用链 ASCII 示意

下面是一张整合主要特性模块的高层调用链示意图，帮助新成员快速建立整体 Mental Model：

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                          UI / Routing (App Router)                       │
│                                                                           │
│  - /[locale]/auth/*            - /[locale]/(protected)/settings/*        │
│  - /[locale]/(marketing)/*     - /ai/* UI / Docs UI                      │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      Actions / API Boundaries                             │
│                                                                           │
│  Server Actions (src/actions)                 API Routes (src/app/api)    │
│  - create-checkout-session                    - /api/webhooks/stripe      │
│  - create-credit-checkout-session            - /api/chat                  │
│  - consume-credits                           - /api/analyze-content       │
│  - get-credit-balance / stats / tx           - /api/generate-images       │
│                                              - /api/storage/upload        │
│                                              - /api/distribute-credits    │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     领域服务 / 模块（Examples）                           │
│                                                                           │
│  Auth & User Lifecycle:                                                   │
│    better-auth (lib/auth.ts)                                             │
│      └─ databaseHooks.user.create.after                                  │
│          └─ handleAuthUserCreated → UserLifecycleManager                 │
│              ├─ 注册赠送积分 → Credits.addRegisterGiftCredits           │
│              └─ Newsletter 订阅等 hooks                                  │
│                                                                           │
│  Payment:                                                                 │
│    Actions → payment/index.ts → services/stripe-*-service                │
│      └─ 调用 Stripe SDK                                                   │
│      └─ 记录 payment 表                                                    │
│                                                                           │
│  Credits:                                                                 │
│    Actions / Cron / Webhooks                                             │
│      └─ credits/credit-ledger-service.ts                                 │
│            └─ CreditLedgerDomainService                                  │
│                 ├─ addCredits / addSubscriptionCredits                   │
│                 └─ consumeCredits / processExpiredCredits                │
│                                                                           │
│  AI (Text / Image):                                                       │
│    /api/analyze-content → analyze-content-handler.ts                     │
│      ├─ Firecrawl 抓取网页                                                │
│      ├─ 调用 OpenAI/Gemini/DeepSeek/OpenRouter                            │
│      └─ WebContentAnalyzerError + logAnalyzerErrorServer                 │
│                                                                           │
│    /api/generate-images                                                   │
│      └─ providerConfig(OpenAI/Fireworks/Replicate/FAL) + generateImage   │
└──────────────┬��──────────────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       基础设施 / 外部依赖                                │
│                                                                           │
│  - Drizzle / Postgres: src/db/schema.ts, migrations                       │
│  - Stripe: Webhook + Checkout                                             │
│  - Firecrawl / AI Providers                                               │
│  - Storage Providers (S3 等)                                              │
│  - Logger (Pino + AsyncLocalStorage)                                     │
└───────────────────────────────────────────────────────────────────────────┘

补充：Credits 典型调用链（端到端简图）

  UI（CreditsPage / ConsumeCreditsCard）
    └─ hooks/use-credits.ts
         ├─ useCreditBalance → get-credit-balance Action
         ├─ useCreditStats   → get-credit-stats Action
         └─ useConsumeCredits → consume-credits Action
              └─ credits.consumeCredits
                   └─ CreditLedgerDomainService.consumeCredits
                        ├─ 读 userCredit / creditTransaction（Drizzle）
                        ├─ FIFO 扣减 remainingAmount
                        └─ 更新 userCredit.currentCredits + usage 记录
```
