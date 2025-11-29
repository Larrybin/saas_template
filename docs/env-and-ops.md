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

---

## 2. Stripe Webhook 配置

### 2.1 入口与处理流程

- Webhook 入口：`src/app/api/webhooks/stripe/route.ts`
  - 通过 `createLoggerFromHeaders` 建立 request logger，span 为 `api.webhooks.stripe`。  
  - 从请求中读取：
    - `payload`：`await req.text()`  
    - `signature`：`req.headers.get('stripe-signature')`  
  - 调用 `handleWebhookEvent(payload, signature)`（`src/payment/index.ts` → `StripePaymentService`）。
  - 处理 DomainError 与未知错误，返回结构化 JSON（`success/error/code/retryable`）。

- Payment 组合根与 StripePaymentService：
  - `src/payment/index.ts` 会从 `serverEnv.stripeSecretKey` 与 `serverEnv.stripeWebhookSecret` 读取配置，创建 Stripe client，并以依赖注入方式构造 `StripePaymentService`。  
  - `StripePaymentService`（`src/payment/services/stripe-payment-service.ts`）内部使用注入的 Stripe client 与 webhook secret 验证事件：
    - `stripe.webhooks.constructEvent(payload, signature, webhookSecret)`。  
  - 通过 `StripeEventRepository.withEventProcessingLock` 确保单个事件幂等处理，将事件交给 `handleStripeWebhookEvent` 更新本地 Payment 状态，并在需要时调用 Billing/Credits。

### 2.2 本地开发与测试

- 本地测试 webhook：
  - 可以使用 `stripe cli` 或 HTTP 工具将事件转发到本地 `/api/webhooks/stripe`。  
  - 确保 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 与 Stripe Dashboard / CLI 配置一致。
- 常见问题：
  - 若缺少 payload 或签名，路由会返回 400 并附带错误信息。  
  - 若 `STRIPE_SECRET_KEY` 或 `STRIPE_WEBHOOK_SECRET` 未配置，初始化 Payment Provider（组合根工厂）时会抛出错误（防止静默失败）。

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

## 6. websiteConfig.ai.billing 配置

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
