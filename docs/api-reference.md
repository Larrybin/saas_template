# API Reference

> 本文以 Diátaxis 的 Reference 风格记录所有公开的 HTTP API（`/api/*`）与 Server Action 接口，面向已经熟悉代码库的开发者，提供只读的请求/响应规范与错误约定。  
> 错误码全集请参阅 `docs/error-codes.md`，日志与 Envelope 规范见 `docs/error-logging.md`。

## 通用约定
- **鉴权**：绝大多数 API/Action 依赖 Better Auth 会话（通过 `ensureApiUser` 或 `userActionClient/adminActionClient`）。文档若标记 `Auth: Session`，表示需要已登录用户；`Auth: Admin` 表示必须拥有管理员角色；`Auth: None` 表示匿名可调用；`Auth: Basic` 表示需携带 `Authorization: Basic ...`。
- **Envelope**：除流式 `POST /api/chat` 外，所有接口遵循统一的 JSON Envelope：

  ```json
  {
    "success": true,
    "data": { "...": "domain specific" }
  }
  // 错误示例
  {
    "success": false,
    "error": "Human readable message",
    "code": "CREDITS_INSUFFICIENT_BALANCE",
    "retryable": false
  }
  ```

- **Rate Limit**：代码中通过 `enforceRateLimit` 设定（scope/limit/window）。若未列出则当前端点未限制。
- **示例**：所有示例均为最小可运行片段，可按需替换参数。

## HTTP API Routes

### POST `/api/chat`
- **Purpose**：将用户消息转发给 AI Provider，并自动结算积分/免费额度。
- **Auth**：Session（Better Auth）。
- **Rate Limit**：30 req / 1 min / user (`scope: 'chat'`)。
- **Request Body**：

  ```json
  {
    "messages": [
      { "role": "user", "content": "Summarize today's highlights" }
    ],
    "model": "gpt-4o-mini",
    "webSearch": false
  }
  ```

- **Response**：`text/event-stream`，由 `ai` SDK 的 `toUIMessageStreamResponse` 推送流式 tokens、sources、reasoning。典型事件：

  ```
  event: message
  data: {"type":"assistant","content":"Here is the summary..."}
  ```
- **Streaming 事件类型**：事件名默认为 `message`，数据字段遵循 `AI SDK` 的 `UIMessageChunk` 定义。常见 `type` 取值：
  - `start` / `finish` / `abort` / `message-metadata`：声明一次会话的开始、结束或被取消，同时携带 `messageId` 与 `messageMetadata`。
  - `text-start` / `text-delta` / `text-end`：正文 token。`text-delta.delta` 是追加文本，`text-end` 表示模型完成该片段。
  - `reasoning-start` / `reasoning-delta` / `reasoning-end`：部分模型暴露的推理链路。
  - `tool-input-*` / `tool-output-*`：（若启用工具）描述工具调用的输入/输出以及 `toolCallId`。
  - `source-url` / `source-document` / `file` / `data-*`：AI SDK 的来源（链接、文档、附件、自定义数据）。
  - `start-step` / `finish-step`：多step 推理的分界。
  - `error`：流内错误（`errorText` 提供描述），通常仍会伴随一个最终 HTTP 200，可在前端直接提示。

- **监听示例**：

  ```ts
  import { parseJsonEventStream } from 'ai';

  async function streamChat(payload: unknown, onDelta: (text: string) => void) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) throw new Error('Chat request failed');

    await parseJsonEventStream(response.body, (event) => {
      const chunk = event.data as { type: string; delta?: string };

      switch (chunk.type) {
        case 'text-delta':
          onDelta(chunk.delta ?? '');
          break;
        case 'error':
          console.error('Model error:', chunk);
          break;
        case 'finish':
          console.info('Stream finished');
          break;
        default:
          // handle other chunk types if needed
          break;
      }
    });
  }
  ```

  该帮助函数会自动解析 SSE，开发者只需根据 `type` 字段决定 UI 行为（累积 `text-delta`，展示 `reasoning-delta`，或根据 `tool-*` 渲染工具调用结果）。

- **Error Codes**：`AI_CHAT_INVALID_JSON`, `AI_CHAT_INVALID_PARAMS`, `CREDITS_INSUFFICIENT_BALANCE`, 以及所有 AI/Credits DomainError。

### POST `/api/analyze-content`
- **Purpose**：抓取给定 URL，生成结构化分析并扣除积分。
- **Auth**：Session。
- **Rate Limit**：5 req / 5 min / user (`scope: 'analyze-content'`)。
- **Request**：

  ```json
  {
    "url": "https://example.com/product",
    "modelProvider": "openai"
  }
  ```

- **Success**：

  ```json
  {
    "success": true,
    "data": {
      "analysis": {
        "title": "Example Product",
        "description": "Marketing landing page",
        "introduction": "...",
        "features": ["Fast", "Secure"],
        "pricing": "$29/month",
        "useCases": ["SaaS dashboards"],
        "url": "https://example.com/product",
        "analyzedAt": "2025-01-05T10:12:44.000Z"
      },
      "screenshot": "data:image/png;base64,..."
    },
    "creditsConsumed": 1
  }
  ```

- **Failure**（示例）：

  ```json
  {
    "success": false,
    "error": "URL must start with http:// or https://",
    "code": "AI_CONTENT_VALIDATION_ERROR",
    "retryable": false
  }
  ```

- **Error Codes**：`AI_CONTENT_*` 系列、`ANALYZE_CONTENT_INVALID_JSON`, `ANALYZE_CONTENT_INVALID_PARAMS`, 通用 `CREDITS_*`。

### POST `/api/generate-images`
- **Purpose**：调用多 Provider（OpenAI/Fireworks/Replicate/FAL）生成图片。
- **Auth**：Session。
- **Rate Limit**：10 req / 2 min / user (`scope: 'generate-images'`)。
- **Request**：

  ```json
  {
    "prompt": "Ultra wide shot of aurora over snowy mountains",
    "provider": "openai",
    "modelId": "gpt-image-1"
  }
  ```

- **Success**：

  ```json
  {
    "success": true,
    "data": {
      "provider": "openai",
      "image": "data:image/png;base64,iVBORw0KGgoAAA..."
    }
  }
  ```

- **Common Errors**：`AI_IMAGE_INVALID_JSON`, `AI_IMAGE_INVALID_PARAMS`, `AI_IMAGE_PROVIDER_ERROR`, `AI_IMAGE_TIMEOUT`, `CREDITS_INSUFFICIENT_BALANCE`。HTTP 504 用于 `ImageTimeout`，502 用于 `ImageInvalidResponse`。

### POST `/api/storage/upload`
- **Purpose**：安全地将文件上传至配置的对象存储（默认 S3 兼容）。
- **Auth**：Session。
- **Rate Limit**：5 req / 1 min / user (`scope: 'storage-upload'`)。
- **Request**：`multipart/form-data`，字段：`file`（必填）、`folder`（可选，默认挂载用户 ID）。

  ```bash
  curl -X POST https://app.example.com/api/storage/upload \
    -H "Cookie: auth_session=..." \
    -F "file=@avatar.png" \
    -F "folder=avatars"
  ```

- **Success**：

  ```json
  {
    "success": true,
    "data": {
      "key": "avatars/user_123/avatar.png",
      "url": "https://cdn.example.com/avatars/user_123/avatar.png",
      "contentType": "image/png",
      "size": 123456
    }
  }
  ```

- **Error Codes**：`STORAGE_INVALID_CONTENT_TYPE`, `STORAGE_NO_FILE`, `STORAGE_FILE_TOO_LARGE` (10MB 限制), `STORAGE_UNSUPPORTED_TYPE`, `STORAGE_INVALID_FOLDER`, `STORAGE_PROVIDER_ERROR`, `STORAGE_UNKNOWN_ERROR`。

### GET `/api/search`
- **Purpose**：Fumadocs i18n 搜索接口，代理 Orama 引擎。
- **Auth**：None（公开）。
- **Parameters**：`q`（搜索词，可选）、`locale`（`en`/`zh`，可选，缺省由 referer 推导）。

  ```bash
  curl "https://app.example.com/api/search?q=architecture&locale=en"
  ```

- **Response**（源于 `createI18nSearchAPI`，示例）：

  ```json
  {
    "results": [
      {
        "id": "/docs/architecture-overview",
        "url": "/docs/architecture-overview",
        "locale": "en",
        "title": "Architecture Overview",
        "description": "Dependency layers and key use cases",
        "score": 0.89
      }
    ],
    "meta": { "limit": 20 }
  }
  ```

- **Notes**：日志中会记录 `queryLength` 与 `locale`，当前未强制 rate limit。

### GET `/api/ping`
- **Purpose**：健康检查。
- **Auth**：None。
- **Response**：`{"message":"pong"}` 。

### GET `/api/distribute-credits`
- **Purpose**：通过 Basic Auth 触发积分发放/过期处理任务。
- **Auth**：Basic（`CRON_JOBS_USERNAME` / `CRON_JOBS_PASSWORD`）。
- **Request**：

  ```bash
  curl -u "$CRON_USERNAME:$CRON_PASSWORD" https://app.example.com/api/distribute-credits
  ```

- **Success**：

  ```json
  {
    "success": true,
    "data": {
      "usersCount": 1200,
      "processedCount": 1185,
      "errorCount": 3
    }
  }
  ```

- **Failure**：
  - `401 Unauthorized`：缺少或错误的 Basic Auth 凭证，返回统一 JSON envelope：

    ```json
    {
      "success": false,
      "error": "Unauthorized",
      "code": "AUTH_UNAUTHORIZED",
      "retryable": false
    }
    ```

    响应头包含 `WWW-Authenticate: Basic realm="Secure Area"`，便于上游 Cron/监控识别 401 类型。

  - `500`：服务器端错误，典型包括：
    - Cron Basic Auth 环境变量未正确配置（`CRON_BASIC_AUTH_MISCONFIGURED`）：

      ```json
      {
        "success": false,
        "error": "Cron basic auth credentials misconfigured",
        "code": "CRON_BASIC_AUTH_MISCONFIGURED",
        "retryable": false
      }
      ```

    - 积分分发 Job 执行异常（`CREDITS_DISTRIBUTION_FAILED`，可重试）：

      ```json
      {
        "success": false,
        "error": "Distribute credits job failed",
        "code": "CREDITS_DISTRIBUTION_FAILED",
        "retryable": true
      }
      ```

### POST `/api/webhooks/stripe`
- **Purpose**：接收 Stripe Webhook 事件（Checkout、Subscription、Payments）。
- **Auth**：Stripe `stripe-signature` header + Webhook Secret 验证。
- **Request**：

  ```bash
  stripe listen --forward-to https://app.example.com/api/webhooks/stripe
  ```

  服务器读取原始 payload（`req.text()`）及 `stripe-signature`，交由 `handleWebhookEvent`.

- **Success**：`{"received": true}`。
- **Error Codes**：`PAYMENT_SECURITY_VIOLATION`（签名错误）、DomainError（Billing/Credits），以及 `UNEXPECTED_ERROR`。

### GET/POST `/api/auth/[...all]`
- **Purpose**：Better Auth Next.js Handler，聚合所有 auth 相关子路由（如 `/api/auth/login`, `/api/auth/register`, `/api/auth/session` 等）。
- **Auth**：视子路由而定；Handler 自动处理 CSRF、Session、Provider OAuth。
- **Usage**：直接将 Better Auth SDK 指向 `/api/auth/*`；无需额外请求体规范，遵循库默认协议。

## Server Actions

### 调用约定
- 所有 Action 均返回 `Promise<{ success: true; data?; ... } | { success: false; error: string; code?: string; retryable?: boolean }>`。
- 成功时 `success: true` 并携带业务数据；失败时 `success: false`，`error` 为人类可读文案，`code` 来自 `ErrorCodes`，`retryable` 表示是否推荐前端提供“重试”操作。
- `actionClient`：匿名调用；`userActionClient`：强制登录用户；`adminActionClient`：管理员专用。
- 推荐前端使用 `unwrapEnvelopeOrThrowDomainError` 解包 Envelope，而不是手写 `if (!result.success)` 分支。
- 示例调用：

  ```ts
  import { createCheckoutAction } from '@/actions/create-checkout-session';
  import { unwrapEnvelopeOrThrowDomainError } from '@/lib/domain-error-utils';

  const res = await createCheckoutAction({
    userId: session.user.id,
    planId: 'pro',
    priceId: 'price_basic',
    metadata: { coupon: 'SPRING25' },
  });

  const data = unwrapEnvelopeOrThrowDomainError<{
    success: true;
    data: { url: string; id: string };
  }>(res.data, {
    defaultErrorMessage: 'Failed to create checkout session',
  });

  // data.success === true，data.data 为业务字段
  ```

### Action 列表

| Action | Auth | 输入要点 | 响应（成功时） |
| --- | --- | --- | --- |
| `createCheckoutAction` | Session | `{ userId, planId, priceId, metadata? }` | Stripe Checkout session（url, id） |
| `createCreditCheckoutSession` | Session | `{ userId, packageId, priceId, metadata? }` | Stripe Checkout session |
| `createPortalAction` | Session | `{ userId, returnUrl? }` | Stripe Portal session |
| `getActiveSubscriptionAction` | Session | `{ userId }` | 最新订阅对象或 `null` |
| `getCreditBalanceAction` | Session | `none` | `{ credits: number }` |
| `getCreditStatsAction` | Session | `none` | `{ data: { expiringCredits: { amount } } }` |
| `getCreditTransactionsAction` | Session | `{ pageIndex, pageSize, search?, sorting? }` | 分页交易列表 |
| `getLifetimeStatusAction` | Session | `{ userId }` | `{ isLifetimeMember: boolean }` |
| `consumeCreditsAction` | Session | `{ amount, description? }` | `{ success: true }` |
| `getUsersAction` | Admin | `{ pageIndex, pageSize, search?, sorting? }` | 管理员查询用户分页 |
| `sendMessageAction` | None | `{ name, email, message }` | `{ success: true }` |
| `checkNewsletterStatusAction` | Session | `{ email }` | `{ subscribed: boolean }` |
| `subscribeNewsletterAction` | None | `{ email }` | 发送欢迎邮件 |
| `unsubscribeNewsletterAction` | Session | `{ email }` | `{ success: true }` |
| `validateCaptchaAction` | None | `{ captchaToken }` | `{ valid: boolean }` |

### 说明与示例

#### Billing & Payments
- **`createCheckoutAction`**：封装 `billingService.startSubscriptionCheckout`，自动注入用户信息、Datafast cookies 与本地化成功/取消回调。失败示例（DomainError）：

  ```json
  {
    "success": false,
    "error": "Price plan not found or disabled",
    "code": "BILLING_PLAN_NOT_FOUND",
    "retryable": false
  }
  ```

- **`createCreditCheckoutSession`**：用于积分套餐，metadata 固定包含 `type: 'credit_purchase'` 方便 Webhook 识别。
- **`createPortalAction`**：查询 `user.customerId`，生成 Stripe Customer Portal Link。若用户尚未绑定 `customerId` 会返回 `success: false`。

#### Credits
- **`getCreditBalanceAction`**：返回最新余额（`credits.number`）；内部调用 `getUserCredits`。
- **`getCreditStatsAction`**：统计未来 `CREDITS_EXPIRATION_DAYS` 内将过期额度。
- **`getCreditTransactionsAction`**：支持模糊搜索（type / paymentId / description），搜索字符串为数字时会额外匹配 `amount`。排序字段参见 `sortFieldMap`。
- **`consumeCreditsAction`**：直接调用 `credits.consumeCredits`，失败会由安全客户端捕获 DomainError（例如余额不足）。
- **`getLifetimeStatusAction`**：基于数据库 `payment` 表，确认是否存在已完成的一次性 lifetime 交易。

#### Admin & Newsletter
- **`getUsersAction`**：仅 `adminActionClient` 可调用。在 Demo 环境（`isDemoWebsite`）会对姓名/邮箱/customerId 做脱敏。
- **`checkNewsletterStatusAction` / `subscribeNewsletterAction` / `unsubscribeNewsletterAction`**：使用 `newsletter` 模块与 `sendEmail` 发送欢迎信。`subscribe` 支持未登录访客，`unsubscribe` 需要 Session，用于设置页按钮。

#### Forms & Validation
- **`sendMessageAction`**：联系表单 Action，使用 `websiteConfig.mail.supportEmail` 作为收件人，Zod 校验 name/email/message。
- **`validateCaptchaAction`**：调用 Cloudflare Turnstile 验证。示例：

  ```ts
  const res = await validateCaptchaAction({ captchaToken });
  if (!res.success || !res.valid) throw new Error('Captcha invalid');
  ```

## 参考资料
- 错误码与 UI 策略：`docs/error-codes.md`, `docs/error-logging.md`
- 领域生命周期：`docs/ai-lifecycle.md`, `docs/credits-lifecycle.md`, `docs/payment-lifecycle.md`, `docs/storage-lifecycle.md`
- 日志/运维：`docs/env-and-ops.md`

遵循本参考文档即可快速定位各端点的需求和响应格式，确保新建集成或文档同步时保持一致性。***
