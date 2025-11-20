# Error & Logging Model

本项目的错误与日志模型围绕三个层次设计：Domain 层（业务错误）、边缘层（Actions / API routes）与前端消费层。

## 1. DomainError 模型

- 所有业务级错误应继承 `DomainError`：

  ```ts
  export class DomainError extends Error {
    readonly code: string;
    readonly retryable: boolean;
  }
  ```

- 典型子类：
  - `PaymentSecurityError`（`PAYMENT_SECURITY_VIOLATION`）
  - `InvalidCreditPayloadError` / `InsufficientCreditsError` 等

约定：

- `code`：稳定的、机器可读的错误码（`CREDITS_INSUFFICIENT_BALANCE` 等），供日志与前端分支使用。
- `retryable`：标记是否建议调用方重试（true 通常映射为 5xx，false 映射为 4xx）。

## 2. Server Actions（safe-action）处理

所有 `src/actions/*` 均通过 `createSafeActionClient` 包裹：

```ts
export const actionClient = createSafeActionClient({
  handleServerError: (e) => {
    if (e instanceof DomainError) {
      logger.error('Domain error in safe-action', { code: e.code, retryable: e.retryable, error: e });
      return { success: false, error: e.message, code: e.code, retryable: e.retryable };
    }

    if (e instanceof Error) {
      logger.error('Unhandled error in safe-action', { error: e });
      return { success: false, error: e.message };
    }

    return {
      success: false,
      error: 'Something went wrong while executing the action',
    };
  },
});
```

约定：

- Actions 内尽量不捕获 `DomainError`，直接抛出，由 `handleServerError` 统一封装。
- 若确需业务分支（如 “找不到 package”），可在 action 内显式返回 `{ success: false, error: '...' }`，但不要重新包装 `DomainError`。

## 3. API Routes 处理

推荐模式（Stripe webhook 已部分采用）：

```ts
try {
  // ...
  return NextResponse.json({ success: true, data }, { status: 200 });
} catch (error) {
  if (error instanceof DomainError) {
    const status = error.retryable ? 500 : 400;
    logger.error('Domain error in route', { code: error.code, retryable: error.retryable, error });

    return NextResponse.json(
      { success: false, error: error.message, code: error.code, retryable: error.retryable },
      { status }
    );
  }

  logger.error('Unhandled error in route', { error });
  return NextResponse.json(
    { success: false, error: 'Internal server error', code: 'UNEXPECTED_ERROR' },
    { status: 500 }
  );
}
```

约定：

- 新的 `/api/*` 路由优先采用 `{ success, error, code?, retryable? }` 的 envelope。
- 现有路由可逐步迁移，在保持兼容前端调用的前提下增加 `success`/`code` 字段。

## 4. 日志上下文

日志使用 `src/lib/server/logger.ts` 提供的 Pino 封装：

- `getLogger(bindings)`: 从 `AsyncLocalStorage` 获取上下文（`requestId`, `userId`, `span` 等），返回带有这些字段的 logger。
- `withLogContext(bindings, fn)`: 在调用栈中附加日志上下文。
- `createLoggerFromHeaders(headers, metadata)`: 从请求头解析 `x-request-id` / `x-requestid` 并创建带有 `requestId` 的 logger，适用于 API routes / 中间层。

建议的 `span` 命名规范（便于日志聚合）：

- HTTP API：`api.<域>.<子域>`，例如：
  - `api.ai.chat`（聊天流式接口）
  - `api.ai.text.analyze`（网页内容分析接口）
  - `api.ai.image.generate`（图片生成接口）
  - `api.credits.distribute`（积分分发 API）
  - `api.storage.upload`（文件上传 API）
  - `api.docs.search`（文档搜索 API）
- 领域服务 / 批处理：`credits.*`, `payment.*`, `mail.*` 等（已在对应模块中使用）。
- 基础设施：`infra.*`，例如 `infra.api-auth`、`safe-action` 等。

常用 span 汇总表（便于日志筛选）：

| span 值                                 | 描述                                   |
| --------------------------------------- | -------------------------------------- |
| `api.ai.chat`                           | Chat 接口 `/api/chat`                  |
| `api.ai.text.analyze`                  | 文本分析接口 `/api/analyze-content`    |
| `api.ai.image.generate`                | 图片生成接口 `/api/generate-images`    |
| `api.docs.search`                      | 文档搜索接口 `/api/search`             |
| `api.credits.distribute`              | 积分分发接口 `/api/distribute-credits` |
| `api.storage.upload`                  | 文件上传接口 `/api/storage/upload`     |
| `api.webhooks.stripe`                 | Stripe Webhook 路由                     |
| `usecase.ai.chat-with-billing`        | Chat + 积分扣费用例                     |
| `usecase.ai.text.analyze-with-credits`| 文本分析 + 积分扣费用例                 |
| `usecase.ai.image.generate-with-credits`| 图片生成 + 积分扣费用例               |
| `credits.ledger.domain`               | Credits 账本领域服务                    |
| `credits.distribute`                  | 积分分发任务                            |
| `credits.expiry.job`                  | 积分过期处理任务                        |
| `payment.stripe`                      | Stripe 支付服务                         |
| `payment.security`                    | 支付安全监控                            |
| `ai.web-content-analyzer`             | Web 内容分析（服务端）                  |
| `infra.api-auth`                      | API 鉴权逻辑                            |
| `safe-action`                         | safe-action 全局错误处理                |

约定：

- `safe-action` 与关键 API routes 应通过 `withLogContext` 或 `createLoggerFromHeaders` 设置 `requestId`、`userId`、`span` 等，便于错误定位。
- Domain 层只需抛出 `DomainError`，不直接关心日志实现。

示例：在 API route 中创建 request logger 并记录 DomainError：

```ts
import { createLoggerFromHeaders } from '@/lib/server/logger';
import { DomainError } from '@/lib/domain-errors';

export async function POST(request: Request) {
  const logger = createLoggerFromHeaders(request.headers, {
    span: 'api.example.feature',
    route: '/api/example',
  });

  try {
    // ...
  } catch (error) {
    if (error instanceof DomainError) {
      logger.error(
        { error, code: error.code, retryable: error.retryable },
        'Domain error in route'
      );
      // 返回带 code/retryable 的 JSON
    } else {
      logger.error({ error }, 'Unhandled error in route');
      // 返回 500
    }
  }
}
```

## 5. 前端消费与文案

`src/lib/domain-error-utils.ts` 提供前端消费 helper：

- `DomainErrorLike = { code?: string; retryable?: boolean }`
- `getDomainErrorMessage(code, t, fallback)`：根据 `code` 映射到 i18n key，例如：
  - `CREDITS_INSUFFICIENT_BALANCE` → `Dashboard.settings.credits.balance.insufficientCredits`
  - `PAYMENT_SECURITY_VIOLATION` → `Dashboard.settings.credits.packages.purchaseFailed`

使用示例：

```ts
const message = getDomainErrorMessage(code, t, t('...fallbackKey'));
toast.error(message);
```

约定：

- 组件尽量不要硬编码英文错误文案，而是通过 `getDomainErrorMessage` + i18n key 输出。
- 若代码中需要根据 `code` 做行为分支（跳转/重试），请使用枚举式字符串常量，并保持与 DomainError 子类中的 `code` 一致。

## 6. Auth 未登录错误（AUTH_UNAUTHORIZED）

### 后端约定

- API routes 中使用 `ensureApiUser` 统一鉴权（如 `/api/chat`、`/api/analyze-content`、`/api/generate-images`）：
  - 未登录或会话解析失败时直接返回标准 401：
    ```ts
    {
      success: false,
      error: 'Unauthorized',
      code: 'AUTH_UNAUTHORIZED',
      retryable: false,
    }
    ```
- safe-action 中，`userActionClient` / `adminActionClient` 对未登录或非管理员场景也返回相同结构：
  ```ts
  return {
    success: false,
    error: 'Unauthorized',
    code: 'AUTH_UNAUTHORIZED',
    retryable: false,
  };
  ```

### 前端约定

- 公共 Hook：`useAuthErrorHandler`（`src/hooks/use-auth-error-handler.ts`）统一处理未登录错误：
  - 输入：`{ code?: string; retryable?: boolean; message?: string }`。
  - 行为：当 `code === 'AUTH_UNAUTHORIZED'` 时：
    - 使用 `getDomainErrorMessage` + `next-intl` 生成文案（映射到 `Common.unauthorized`）。
    - 通过 `sonner.toast.error` 弹出提示。
    - 使用 `useLocaleRouter` 跳转至登录页 `Routes.Login`（带当前 locale）。
- 使用规范：
  - Credits 域 hooks（`useCreditBalance` / `useCreditStats` / `useConsumeCredits` / `useCreditTransactions`）在收到 `AUTH_UNAUTHORIZED` 时必须先调用 `useAuthErrorHandler`，再抛出业务错误（如有需要）。
  - AI 域：
    - 文本分析：`useWebContentAnalyzer` 在 `/api/analyze-content` 返回 401 + `AUTH_UNAUTHORIZED` 时调用该 Hook。
    - 图片生成：`useImageGeneration` 在 `/api/generate-images` 返回 401 + `AUTH_UNAUTHORIZED` 时调用该 Hook。
    - Chat：`ChatBot` 通过 `useChat` 的 `onResponse` 钩子拦截 `/api/chat` 的 401 响应并调用该 Hook。

### 文案与 i18n 映射

- `src/lib/domain-error-utils.ts` 中已经将 `AUTH_UNAUTHORIZED` 映射为 `Common.unauthorized`。
- i18n 文案：
  - `messages/en.json`: `"Common.unauthorized": "You must be logged in to perform this action."`
  - `messages/zh.json`: `"Common.unauthorized": "请先登录后再执行此操作。"`

约定：

- 所有与登录状态相关的未授权错误一律使用 `AUTH_UNAUTHORIZED` + `Common.unauthorized`，避免散落的 401 文案。
- 非登录态的权限错误（如业务级禁止访问）如需细分，应使用新的 DomainError code（例如 `AUTH_FORBIDDEN`），并在前后端分别补充映射与文案。

## 7. AI 错误 Code 一览（文本 & 图片）

为便于前后端对齐，AI 域常用错误 code、i18n key 与建议 UX 如下：

| 领域 | code                            | i18n key                                        | 建议 UX                                             |
| ---- | -------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| 文本 | `AI_CONTENT_VALIDATION_ERROR`    | `AITextPage.analyzer.errors.invalidUrl`         | 提示 URL 格式错误，高亮输入框                       |
| 文本 | `AI_CONTENT_NETWORK_ERROR`       | `AITextPage.analyzer.errors.networkError`       | 提示网络问题，建议检查网络并允许重试               |
| 文本 | `AI_CONTENT_TIMEOUT`             | `AITextPage.analyzer.errors.timeout`            | 提示请求超时，建议稍后重试或简化页面               |
| 文本 | `AI_CONTENT_RATE_LIMIT`          | `AITextPage.analyzer.errors.rateLimit`          | 提示请求过于频繁，鼓励稍后再试                     |
| 文本 | `AI_CONTENT_AUTH_ERROR`          | `AITextPage.analyzer.errors.authError`          | 提示认证失败，建议刷新页面或重新登录               |
| 文本 | `AI_CONTENT_SERVICE_UNAVAILABLE` | `AITextPage.analyzer.errors.serviceUnavailable` | 提示服务暂时不可用，建议稍后再试                   |
| 文本 | `AI_CONTENT_SCRAPING_ERROR`      | `AITextPage.analyzer.errors.scrapingError`      | 提示无法访问/抓取网页，引导检查 URL 或网站可用性   |
| 文本 | `AI_CONTENT_ANALYSIS_ERROR`      | `AITextPage.analyzer.errors.analysisError`      | 提示分析失败，建议重试                             |
| 文本 | `AI_CONTENT_UNKNOWN_ERROR`       | `AITextPage.analyzer.errors.unknownError`       | 提示未知错误，保持文案通用                          |
| 图片 | `AI_IMAGE_INVALID_JSON`          | `AIImagePage.errors.invalidRequest`             | 提示请求无效，建议刷新页面后重试                   |
| 图片 | `AI_IMAGE_INVALID_PARAMS`        | `AIImagePage.errors.invalidParams`              | 提示提示词/模型参数无效，引导用户检查输入与选择    |
| 图片 | `AI_IMAGE_INVALID_RESPONSE`      | `AIImagePage.errors.providerError`              | 提示服务返回异常，建议稍后重试或切换服务商         |
| 图片 | `AI_IMAGE_TIMEOUT`               | `AIImagePage.errors.timeout`                    | 提示生成超时，建议简化提示词或稍后重试             |
| 图片 | `AI_IMAGE_PROVIDER_ERROR`        | `AIImagePage.errors.providerError`              | 提示服务内部错误，建议重试或更换模型/服务商        |

约定：

- 新增 AI 相关错误时，应同步：
  - Domain 层 / API 路由返回的 `code`；
  - `DOMAIN_ERROR_I18N_KEYS` 中的 i18n key 映射；
  - `messages/*.json` 中的具体文案；
  - 若需特殊行为（如跳转购买积分页、展示重试按钮），在对应的 hook 或组件中基于 `code` 做行为分支，而不是散落在任意调用点。

## 8. UI 级错误交互（规划中）

目前错误模型已经在 Domain / API / hooks 层统一，下一步可以在具体 UI 组件中按 `code` 做更细的交互。这部分暂不实现，仅作为后续改进规划：

- AI 图片（ImagePlayground）
  - 在模型卡片组件（`ModelSelect` / `ModelCardCarousel`）中，根据 `ImageError.code` 决定交互：
    - `AI_IMAGE_INVALID_PARAMS`：在对应卡片下方高亮错误提示，引导用户检查 prompt 或模型选择；
    - `AI_IMAGE_PROVIDER_ERROR` / `AI_IMAGE_INVALID_RESPONSE`：在卡片上显示「重试当前模型」按钮，只重新触发该 provider 的请求；
    - `AI_IMAGE_TIMEOUT`：在卡片级别提示「可尝试简化提示词」，并提供「重试」按钮。
  - 行为实现建议封装在一个小的 `useImageGenerationErrorUi` 或卡片内部 helper 中，避免在页面组件里散落 `if (code === ...)`。

- AI 文本分析（WebContentAnalyzer）
  - 在分析结果页 / 错误提示区域中，根据 `WebContentAnalyzerError.code` 做差异化引导：
    - `AI_CONTENT_SCRAPING_ERROR`：在错误提示中增加「打开原始链接」或「检查 URL」的操作入口；
    - `AI_CONTENT_TIMEOUT` / `AI_CONTENT_SERVICE_UNAVAILABLE`：强调「稍后重试」而非立刻重试，避免用户频繁点击；
    - `AI_CONTENT_RATE_LIMIT`：可在 toast 中显示冷却建议（例如「几秒后再试」）。
  - 这些行为建议集中封装在 `useWebContentAnalyzer` 内部或一个单独的 UI helper，而不是在多个组件中复制。

- Credits 页（余额卡片 / 消费入口 / 积分购买）
  - 已有 `CREDITS_INSUFFICIENT_BALANCE` 与 `AUTH_UNAUTHORIZED` 的统一文案，后续可在具体入口组件中细分行为：
    - 积分消费入口（真实使用 `useConsumeCredits` 的组件）中：
      - `CREDITS_INSUFFICIENT_BALANCE`：优先弹出「购买积分」对话框或引导跳转到 Credits 设置页；
    - 结算按钮（如 `CreditCheckoutButton`）：
      - `PAYMENT_SECURITY_VIOLATION`：在 toast 中提示「支付失败，请稍后再试或联系支持」，并可选记录埋点。
  - 建议将这类行为封装为小的 UI helper（例如 `useCreditsErrorUi`），由页面/卡片组件调用。
  - 积分额度与过期策略由 `src/credits/config.ts` 适配器从 `websiteConfig` / price plan 中抽取，对错误模型和前端消费透明，未来若改为从数据库或后台配置读取，只需调整适配器即可。

以上 UI 级行为在编码前，应先统一约定：

- 每个 `code` 对应的 UX 目标（仅提示 / 引导跳转 / 提供重试入口）；
- 行为应集中在少量 hooks 或 UI helper 中实现，组件层尽量只做调用，避免逻辑分散。
