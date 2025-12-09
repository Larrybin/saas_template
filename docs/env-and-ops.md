# Env & Ops 指南（环境与运维）

> 本文聚焦环境变量配置、Stripe Webhook、Cron 触发积分任务与日志查看等运维相关实践，帮助你在不同环境下稳定运行本项目。

---

## 1. 环境变量总览

环境变量由 `src/env/server.ts` 与 `src/env/client.ts` 统一管理，分别通过 Zod schema 做校验：

- 服务器端（`src/env/server.ts`）：
  - 必填：
    - `DATABASE_URL`：数据库连接串（Postgres）。
    - `BETTER_AUTH_SECRET`：Better Auth 的服务端密钥。
  - 支付 / 邮件 / 存储 / AI / 限流等：
    - Stripe：`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
    - Creem（Phase A，仅非生产环境可选）：`CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_API_URL`
    - Resend：`RESEND_API_KEY`, `RESEND_AUDIENCE_ID`
    - Storage：`STORAGE_REGION`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET_NAME`, `STORAGE_PUBLIC_URL`, `STORAGE_FORCE_PATH_STYLE`
    - Turnstile：`TURNSTILE_SECRET_KEY`
    - 通知：`DISCORD_WEBHOOK_URL`, `FEISHU_WEBHOOK_URL`
    - Cron Basic Auth：`CRON_JOBS_USERNAME`, `CRON_JOBS_PASSWORD`
    - AI 提供方：`FAL_API_KEY`, `FIRECRAWL_API_KEY`, `FIREWORKS_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`
    - OAuth：`GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`
    - 限流：`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_REQUIRE_REDIS`

- 客户端（`src/env/client.ts`）：
  - 站点基础：`NEXT_PUBLIC_BASE_URL`
  - Demo & 性能：`NEXT_PUBLIC_DEMO_WEBSITE`, `NEXT_PUBLIC_ENABLE_PERF_LOGS`
  - 邮件：`NEXT_PUBLIC_MAIL_FROM_EMAIL`, `NEXT_PUBLIC_MAIL_SUPPORT_EMAIL`（格式会被严格校验）
  - Stripe 价格 ID（前端展示用）：`NEXT_PUBLIC_STRIPE_PRICE_*`（Pro、Lifetime、Credits Packages）
  - Turnstile site key：`NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - Analytics：Google / Umami / OpenPanel / Plausible / Ahrefs / Seline / DataFast 等对应的 `NEXT_PUBLIC_*` 变量
  - Affiliate：`NEXT_PUBLIC_AFFILIATE_AFFONSO_ID`, `NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID`
  - Crisp：`NEXT_PUBLIC_CRISP_WEBSITE_ID`

建议：

- 本地开发：从 `env.example` 拷贝到 `.env.local`，按需填充关键变量（DB、Better Auth、Stripe、Storage）。
- CI / 生产环境：通过托管平台（Vercel / Cloudflare / 自建）配置环境变量，保持 `.env*` 文件不提交到仓库。

> 注：当前模板默认使用 Creem 作为 Payment Provider，`websiteConfig.payment.provider` 的默认值已经切换为 `'creem'`。如需改回 Stripe，只需在配置中显式设置 `provider: 'stripe'`。Creem 的 Test Mode / Live Mode 由 `CREEM_API_URL` 决定：`https://test-api.creem.io/v1` 对应测试环境，`https://api.creem.io/v1` 对应生产环境；请确保 API Key 与 URL 成对配置。

---

## 2. Env ↔ 协议行为映射

下表集中描述关键环境变量与协议/API 行为之间的关系，特别是缺失或配置错误时的表现（HTTP 状态 + 错误码），用于运维排查与告警配置。

| Env                                | 受影响协议/API                            | 缺失/配置错误时行为                                                                                          |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`               | Stripe 客户端初始化（Payment 域）         | 构造 Stripe client 时抛 `ConfigurationError` 并输出 `{ missingKeys: ['STRIPE_SECRET_KEY'] }` 日志，相关支付流程无法使用；一般视为配置错误，需修正后重新部署。 |
| `STRIPE_WEBHOOK_SECRET`           | `POST /api/webhooks/stripe`               | Stripe Webhook 验签失败时抛 `PAYMENT_SECURITY_VIOLATION`（400，`retryable: false`），详见 `docs/payment-lifecycle.md`。 |
| `CREEM_API_KEY` / `CREEM_API_URL` | Creem Provider / `POST /api/webhooks/creem` | 组合不正确时抛 `PAYMENT_SECURITY_VIOLATION` 或 `CREEM_PROVIDER_MISCONFIGURED`，部分请求可能返回 500；详情见 `docs/payment-lifecycle.md`。 |
| `CREEM_WEBHOOK_SECRET`            | `POST /api/webhooks/creem`               | Webhook 验签失败时抛 `PAYMENT_SECURITY_VIOLATION`（400），不会执行后续 side-effect。                        |
| `CRON_JOBS_USERNAME` / `CRON_JOBS_PASSWORD` | `GET /api/distribute-credits`      | 缺失时：返回 500 + `CRON_BASIC_AUTH_MISCONFIGURED`（`retryable: false`）；错误 Basic Auth 时：401 + `AUTH_UNAUTHORIZED`。 |
| Storage 相关 env（`STORAGE_*`）   | `POST /api/storage/upload` 等             | 配置错误可能导致 Storage 客户端初始化或上传失败，返回 `STORAGE_PROVIDER_ERROR` 或 `STORAGE_UNKNOWN_ERROR`，详见 `docs/storage-lifecycle.md`。 |
| AI Provider 相关 env（`OPENAI_API_KEY` 等） | `/api/chat`、`/api/analyze-content`、`/api/generate-images` | 缺失或无效时，通常通过 AI usecase 映射为 `AI_CONTENT_AUTH_ERROR` / `AI_CONTENT_SERVICE_UNAVAILABLE` 等错误码，详见 `docs/ai-lifecycle.md`。 |

### 1.1 Creem 环境变量（Phase A）


#### Creem（可选，Phase A 内部使用）

Creem 目前处于 Phase A 集成阶段，仅用于内部联调与验证。生产环境仍以 Stripe 为唯一默认 Provider。

**环境变量**

- `CREEM_API_KEY`
  - Creem 服务端 API Key。
  - 测试环境：使用 Creem Test Mode API Key。
  - 生产环境：使用 Creem Live API Key。
  - 禁止在测试环境使用生产 Key，反之亦然。

- `CREEM_WEBHOOK_SECRET`
  - 对应 Creem Dashboard › Developers › Webhooks 中配置的签名 Secret。
  - `/api/webhooks/creem` 使用该值进行 HMAC-SHA256 验签，未通过验签的请求一律视为不可信输入。

- `CREEM_API_URL`
  - Creem API Base URL。
  - 非生产环境：必须使用 Test Mode Endpoint `https://test-api.creem.io/v1`。
  - 生产环境：必须使用 Live Endpoint `https://api.creem.io/v1`。
  - 禁止出现 “Test Key + Prod URL” 或 “Live Key + Test URL” 的组合。

**Provider 选择与环境区分**

- `websiteConfig.payment.provider` 目前支持 `'stripe' | 'creem'`，默认值为 `'creem'`：
  - 想使用 Stripe 时，手动将 `provider` 改为 `'stripe'`；
  - 否则走 Creem Provider（包括本地/测试/生产）。
- Creem 的 Test Mode / Live Mode 由 `CREEM_API_URL` 与对应 API Key 决定：
  - 测试环境：`CREEM_API_URL=https://test-api.creem.io/v1` 且使用 Test Mode API Key；
  - 生产环境：`CREEM_API_URL=https://api.creem.io/v1` 且使用 Live Mode API Key；
  - 禁止 “Test Key + Live URL” 或 “Live Key + Test URL” 的混搭。
- 当 `provider='creem'` 时，`DefaultPaymentProviderFactory` 会始终返回 Creem Provider，并根据 `CREEM_API_URL` 连接到相应环境；生产管控与风险评估需要通过配置管理（例如在不同部署环境设置不同的 `CREEM_API_URL` / `CREEM_API_KEY`）来完成。

**官方文档参考**

- 标准 Checkout 集成流程与 Test Mode：<https://docs.creem.io/checkout-flow>
- Webhooks 与事件类型：<https://docs.creem.io/learn/webhooks/introduction>

本项目仅在内部架构层定义 Creem 集成方式，所有字段含义、事件语义和签名规则以上述官方文档为唯一权威来源。

### 1.2 Creem Better Auth 插件（Phase B-Plugin）

Better Auth 的 Creem 插件在本模板中只负责构建「访问控制视图」，不会成为第二套计费事实来源，也不会替代 Payment/Billing/Credits/Membership 账本。

- `CREEM_BETTER_AUTH_ENABLED`
  - 类型：`'true' | 'false'`（未设置视为 `false`）。
  - 非生产环境（本地开发 / 预发布）：
    - 可以设置为 `true` 以启用 Better Auth Creem 插件与 `ExternalAccessProvider` 的集成；
    - 插件运行在 Database Mode（`persistSubscriptions: true`），只读取本地同步的 Creem 订阅视图，用于追加 `feature:*` 级访问能力（例如 `feature:creem:any-subscription`）。
  - 生产环境：
    - 默认建议保持未设置/`false`，在未经单独评审与压测前不启用该开关；
    - 即便启用，该插件也只能基于 Webhook + Billing/Credits/Membership 写入数据库后的账本结果构建访问视图，不得绕过 `/api/webhooks/creem`、也不得直接授予 Subscription/Lifetime/积分。
  - 当未显式设置该变量且 `websiteConfig.payment.provider === 'creem'` 时，系统会默认启用插件；如需关闭，可将该变量显式设为 `'false'`。

> 注意：`CREEM_BETTER_AUTH_ENABLED` 仅控制 Better Auth 插件和 `ExternalAccessProvider` 是否启用，与支付 Provider 的选择无关。支付路径仍由 `websiteConfig.payment.provider` 决定（默认 `'creem'`），而具体连到 Test Mode 还是 Live Mode 则由 `CREEM_API_URL`/`CREEM_API_KEY` 配套配置决定。

---

## 2. Stripe Webhook 配置

### 2.1 入口与处理流程

- Webhook 入口：`src/app/api/webhooks/stripe/route.ts`
  - 通过 `createLoggerFromHeaders` 建立 request logger，span 为 `api.webhooks.stripe`。
  - 从请求中读取：
    - `payload`：`await req.text()`
    - `signature`：`req.headers.get('stripe-signature')`
  - 调用 `handleStripeWebhook(payload, signature)`（`src/lib/server/stripe-webhook.ts`）。
  - 处理 DomainError 与未知错误，返回结构化 JSON（`success/error/code/retryable`）。

- Webhook 组合根与 StripeWebhookHandler：
  - `src/lib/server/stripe-webhook.ts` 从 `serverEnv.stripeSecretKey` 与 `serverEnv.stripeWebhookSecret` 读取配置，创建 Stripe client，并以依赖注入方式构造 `StripeWebhookHandler`。
  - `StripeWebhookHandler`（`src/payment/services/stripe-webhook-handler.ts`）内部使用注入的 Stripe client 与 webhook secret 验证事件：
    - `stripe.webhooks.constructEvent(payload, signature, webhookSecret)`。
  - 通过 `StripeEventRepository.withEventProcessingLock` 确保单个事件幂等处理，将事件交给 `handleStripeWebhookEvent` 更新本地 Payment 状态，并在需要时调用 Billing/Credits。

### 2.2 本地开发与测试

- 本地测试 webhook：
  - 可以使用 `stripe cli` 或 HTTP 工具将事件转发到本地 `/api/webhooks/stripe`。
  - 确保 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 与 Stripe Dashboard / CLI 配置一致。
- 常见问题：
  - 若缺少 payload 或签名，路由会返回 400 并附带错误信息。
  - 若 `STRIPE_SECRET_KEY` 或 `STRIPE_WEBHOOK_SECRET` 未配置，初始化 Payment Provider（组合根工厂）时会抛出错误（防止静默失败）。

> 注：Creem Webhook 入口为 `/api/webhooks/creem`，当前已通过 `CreemWebhookHandler` 在服务端完成验签、幂等处理，并接入 Payment/Billing/Credits 主链路（与 Stripe 路径在领域层对齐）。Creem 现已作为默认 Provider 使用，但仍需确保 Test Mode/Live Mode 的环境变量配置正确，并在运维流程中纳入相应的监控、风控与对账策略；若想暂时只使用 Stripe，可在 `websiteConfig.payment.provider` 中显式配置 `'stripe'`。

---

## 3. Cron & 内部 Job 调度

### 3.1 积分分发 Job（Distribute Credits）

- API 入口：`src/app/api/distribute-credits/route.ts`
  - 使用 Basic Auth 保护：
    - 从 `serverEnv.cronJobs.username/password` 读取预期凭证（对应环境变量 `CRON_JOBS_USERNAME` / `CRON_JOBS_PASSWORD`）。
    - 使用 `validateInternalJobBasicAuth(request, logger, expected)`（`src/lib/server/internal-auth.ts`）校验请求头 `Authorization: Basic ...`；未配置凭证会记录 `Basic auth credentials not configured in environment variables` 并拒绝 Job，凭证错误会记录 `Invalid basic auth credentials`，利于排障。
    - 本地/预发验证：使用 `curl -u username:password https://your-domain.com/api/distribute-credits` 或 `echo -n "username:password" | base64` 生成 header，结合日志确认请求是否通过。
  - 日志：
    - 通过 `createLoggerFromHeaders` 创建 logger，`span: 'api.credits.distribute'`，`route: '/api/distribute-credits'`。
    - 记录未授权访问、Job 触发、完成/失败等信息，Basic Auth 失败的告警会在这里出现。
  - Job 运行：
    - 调用 `runCreditsDistributionJob()`（`src/lib/server/usecases/distribute-credits-job.ts`），该 usecase 会：
      - 生成 `jobRunId` 并记录开始/结束日志。
      - 调用 `distributeCreditsToAllUsers()`（`src/credits/distribute.ts`）执行实际分发与过期处理。
      - 返回 `{ usersCount, processedCount, errorCount }`。

- Cron 调用建议：
  - 使用平台自带的 Cron（如 Vercel Cron / Cloudflare Cron / 自建 Scheduler），定期 `GET https://your-domain.com/api/distribute-credits`。
  - 在 Cron 配置中添加 Basic Auth 头，例如：
    - `Authorization: Basic base64("username:password")`，与 `CRON_JOBS_USERNAME/PASSWORD` 保持一致；缺失或错误会被 `validateInternalJobBasicAuth` 拒绝并在日志中标记。
  - 根据日志与返回 JSON 中的 `usersCount/processedCount/errorCount` 监控分发效果。
  - 约定：当新增第二个使用 Basic Auth 的内部 Job 路由时，应抽象 `ensureInternalJobAuthorized` 之类 helper，避免在各路由重复 env/401/5xx 分支。

### 3.2 其他内部 Job

- 若需要新增内部 Job：
  - 推荐模式：
    - 在 `src/lib/server/usecases` 中新增 usecase（类似 `distribute-credits-job`）。
    - 在 `src/app/api/*` 添加受保护的 API 入口，使用 `validateInternalJobBasicAuth` 做 Basic Auth。
    - 使用 `createLoggerFromHeaders` 与 `job-logger`（如有）记录 `span/job/jobRunId`。

---

## 4. 日志与可观测性

### 4.1 Logger 基础

- Logger 实现：`src/lib/server/logger.ts`
  - 基于 `pino` + `AsyncLocalStorage`，支持结构化日志与上下文传递。
  - 核心 API：
    - `getLogger(bindings)`：获取带有当前上下文 + 新绑定字段的 logger。
    - `withLogContext(bindings, fn)`：在异步调用链中注入 `requestId/userId/span` 等上下文。
    - `createLoggerFromHeaders(headers, metadata)`：从 HTTP 头中解析 `x-request-id` / `x-requestid`，生成 request 级 logger。
  - 日志级别：
    - 由 `LOG_LEVEL` 环境变量控制；默认在 development 环境为 `debug`，其他为 `info`。

### 4.2 日志字段约定

- `LogContext` 中常用字段：
  - `requestId`: 请求唯一标识，用于关联同一次调用的所有日志。
  - `userId`: 当前用户 ID（如已登录）。
  - `span`: 逻辑域/用例标识，例如：
    - `api.ai.chat`、`api.ai.text.analyze`、`api.ai.image.generate`
    - `api.credits.distribute`、`api.storage.upload`、`api.webhooks.stripe`
    - `usecase.ai.chat-with-billing`、`payment.stripe`、`credits.distribute` 等。
  - `route`: API 路径（如 `/api/chat`、`/api/distribute-credits`）。
  - `provider`: 外部服务提供方（如 `stripe`、`openai`）。
  - `job` / `jobRunId`: 用于追踪内部 Job 的运行实例。

- 推荐实践：
  - 在 API Route 中：
    - 通过 `createLoggerFromHeaders(request.headers, { span, route })` 创建 logger。
    - 对 DomainError 分支与 Unexpected error 分支分别记录 `code/retryable` 与完整错误对象。
  - 在 Usecase 中：
    - 使用 `withLogContext({ requestId, userId }, () => usecase(...))` 绑定上下文。
    - 使用 `getLogger({ span: 'usecase.xxx', userId })` 获取域内 logger。

### 4.3 日志查看与排查建议

- 本地开发：
  - 日志输出到控制台（stdout），格式为 JSON（Pino 默认格式），可配合 IDE 或终端插件美化。
  - 利用 `span` 与 `requestId` 过滤感兴趣的请求。

- 生产环境：
  - 建议将 stdout/stderr 接入日志平台（如 Datadog、ELK、Loki 等），并基于：
    - `span`（按域/用例分类）；
    - `requestId`（追踪单次请求）；
    - `userId`（在合规前提下分析个体问题）；
    - `job` / `jobRunId`（定位某次 Job 的异常）
    建立 Dashboard 与告警。

---

## 5. 部署与运行建议

- 开发环境：
  - 使用 `.env.local` 提供最小必要变量（数据库、Better Auth、Stripe 测试 key 等）。
  - 启动开发服务器：`pnpm dev`。
  - 本地跑 Job / Webhook 时，结合 `pnpm test` 的相关 tests 或通过 CLI 手动触发。

- 预发布 / 生产环境：
  - 环境变量通过平台配置；禁止将 `.env*` 文件提交到仓库。
  - 在首次部署前，按以下顺序验证：
    1. `/api/ping`：基础健康检查。
    2. Auth 流程（登录/注册/重置密码）。
    3. Payment 测试（使用 Stripe 测试卡）+ Webhook 行为。
    4. Credits 分发 Job：手动触发 `/api/distribute-credits` 并观察日志与返回值。
    5. Storage 上传（如头像上传），确认 Storage 相关 env 正确配置。
  - 为关键路径配置监控与告警（HTTP 5xx、特定 span 下的 error 日志、Job errorCount > 0 等）。

---

## 3. websiteConfig.ai.billing 配置

AI 调用的计费规则不再在业务代码中硬编码，而是集中在 `websiteConfig.ai.billing` 中配置，并通过 `AiBillingPolicy` 适配层提供给 usecase：

- 配置文件：`src/config/website.tsx`
- 类型定义：`WebsiteConfig`（`src/types/index.d.ts`）中的：
  - `ai?: AiConfig`
  - `AiConfig.billing?: AiBillingConfig`
  - `AiBillingConfig` 下的：`chat` / `analyzeContent` / `generateImage`。
- 策略层：`src/ai/billing-policy.ts`（`DefaultAiBillingPolicy` 从 `websiteConfig.ai.billing` 解析规则）。
- 适配器：`src/ai/billing-config.ts`（向 usecase 暴露 `getAi*BillingRule`）。

每个 AI 能力的计费规则结构与 `AiBillingRuleConfig` 对应：

- `enabled?: boolean`：是否启用该能力的计费逻辑（目前主要用于显式关闭某个能力的计费）。
- `creditsPerCall?: number`：单次调用消耗的积分数量。
- `freeCallsPerPeriod?: number`：每个周期内的免费调用次数（按「用户 + 功能」计数），超过后才开始扣积分。
- `rules?: AiBillingRuleOverrideConfig[]`：可选的 plan/region 级覆盖规则，例如为 `pro` 计划或 `eu` 区域设定不同的单价或免费额度；`DefaultAiBillingPolicy` 会根据 `AiBillingContext` 中的 `planId/region` 自动选择最匹配的条目，并在顶层规则基础上叠加覆盖。

默认配置示例（节选自 `src/config/website.tsx`）：

```ts
export const websiteConfig: WebsiteConfig = {
  // ...
  ai: {
    billing: {
      chat: {
        enabled: true,
        creditsPerCall: 1,
        freeCallsPerPeriod: 8,
      },
      analyzeContent: {
        enabled: true,
        creditsPerCall: 1,
        freeCallsPerPeriod: 8,
      },
      generateImage: {
        enabled: true,
        creditsPerCall: 1,
        freeCallsPerPeriod: 8,
      },
    },
  },
  // ...
};
```

在运行时，AI 相关 usecase（如 `executeAiChatWithBilling`、`generateImageWithCredits`）会通过：

- `getAiChatBillingRule` / `getAnalyzeContentBillingRule` / `getImageGenerateBillingRule`
- → `DefaultAiBillingPolicy`
- → `websiteConfig.ai.billing.*`

解析出实际的计费规则，用于决定：

- 当前请求是否仍在免费调用额度内（基于 `freeCallsPerPeriod` 与 `incrementAiUsageAndCheckWithinFreeQuota`）。
- 若超出免费额度时，每次调用应扣除多少积分（`creditsPerCall`）。

如需在不同环境 / 站点对 AI 计费进行统一调整，优先通过修改 `websiteConfig.ai.billing` 来完成，而不是直接改 usecase 代码或在调用处硬编码数值。

通过以上约定与实践，可以在不同环境下稳定运行本项目，并快速排查与定位与 Payment/Credits/Storage/AI 等相关的问题。

---

## 7. 安全基线与限流策略

本项目在默认配置下提供一套可直接使用的安全基线，运维侧需要关注以下几点：

- **HTTPS 与 HSTS**  
  - 生产环境必须确保外部访问仅通过 HTTPS（在 Vercel 上启用 “Enforce HTTPS”）；  
  - `next.config.ts` 中在 `NODE_ENV=production` 时为所有路由添加 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`，配合平台配置共同生效。

- **安全头（Security Headers）**  
  - 所有路由统一注入：
    - `Content-Security-Policy`（限制脚本/样式/图片/连接等资源来源，默认仅允许 `self` + `https:`）；
    - `X-Content-Type-Options=nosniff`；
    - `Referrer-Policy=strict-origin-when-cross-origin`；
    - `Permissions-Policy`（禁用 camera/microphone/geolocation/payment 等高风险能力）；
    - `X-Frame-Options=DENY` / `frame-ancestors 'none'`。  
  - 登录页、控制台页与 `/api/*` 路由额外设置 `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate`，避免浏览器缓存含用户/支付敏感信息的响应。

- **限流（Rate limiting）与 Redis 依赖**  
  - 高风险接口（AI 调用、Storage 上传、积分分发等）通过 `enforceRateLimit` 做限流，通常基于用户 ID + 窗口计数；  
  - 推荐在生产及其他长期运行环境中配置 Upstash Redis：
    - `UPSTASH_REDIS_REST_URL`
    - `UPSTASH_REDIS_REST_TOKEN`  
  - 并将 `RATE_LIMIT_REQUIRE_REDIS=true`：在 Redis 未正确配置或不可用时直接抛错，而不是静默回退到进程内内存桶；本地开发与测试环境默认允许缺失 Redis，并退化为单实例内存限流（同时输出警告日志）。

- **文件上传与存储安全**  
  - 上传入口 `/api/storage/upload`：
    - 要求登录（`ensureApiUser`）与限流（`enforceRateLimit(scope: 'storage-upload')`）；  
    - 限制单文件最大 10MB，仅允许 JPEG/PNG/WebP 图片类型；  
    - 服务端对文件头进行魔数校验，要求 MIME 类型与魔数同时符合白名单。  
  - 存储路径通过白名单根目录 + 正则校验 + 自动附加 `userId` 做隔离，具体 provider（S3/R2 等）由 `src/storage` 抽象控制，方便运维层按需要选择私有/公开 bucket 与访问策略。

- **错误暴露与日志**  
  - Server Actions 与 `/api/*` 路由统一使用 `{ success, error, code?, retryable? }` 的 envelope，错误码在 `docs/error-codes.md` 中归档；  
  - 响应中不返回堆栈、内部 ID 或 token，仅返回用户可见的错误信息与错误码；详细错误（含 `requestId`、`userId`、`span` 等上下文）只写入服务端日志，便于在日志平台聚合与追踪；  
  - AI/Payment/Storage 等领域的错误模型与前端 UI 降级策略详见 `docs/error-logging.md` 与对应领域文档。
