# API 协议与 Envelope 约定

> 面向前端 / SDK 调用方，说明本项目 HTTP API 的响应结构约定以及特例路由。

本文仅覆盖 JSON 级协议与错误 envelope；具体领域流程（Credits、Payment、AI 等）请参考：

- `docs/architecture-overview.md`
- `docs/feature-modules.md`
- `docs/error-codes.md`
- `docs/error-logging.md`

---

## 1. 统一 JSON Envelope 模型

对于**面向前端 / SDK 暴露的 JSON API**，推荐统一使用带 `success` 字段的 envelope：

- 成功：

  ```ts
  type SuccessEnvelope<T> =
    | { success: true; data: T }
    // 某些接口直接在主体结构上暴露字段，但仍保证 success 等 envelope 字段存在
    | ({ success: true } & T);
  ```

- 失败：

  ```ts
  interface ErrorEnvelope {
    success: false;
    error: string;
    code: string;
    retryable?: boolean;
  }
  ```

约定：

- `success`：用于前端 / SDK 快速分支，`true` 表示业务成功，`false` 表示���务失败。
- `error`：面向最终用户的错误信息（英文兜底，UI 层可结合 i18n 做本地化）。
- `code`：来自 `ErrorCodes` 的稳定字符串，便于前端做行为分支、日志与监控聚合。
- `retryable`：
  - `true`：建议调用方在合适的退避策略下重试，多数情况下对应 5xx。
  - `false`：不建议重试，多数情况下对应 4xx。

当前项目中，API routes 主要采用两种成功 envelope 形态：

- S1：`{ success: true, data: T }`，例如：
  - `/api/storage/upload`
  - `/api/distribute-credits`
- S2：领域类型本身即为 HTTP 模型，但保证包含 `success` / `error?` / `code?` / `retryable?`，例如：
  - `/api/analyze-content` 使用的 `AnalyzeContentResponse`

前端 / SDK 在消费这些 API 时，应优先依赖 `success`/`code`/`retryable` 等 envelope 字段做统一处理，而不是依赖具体 `data` 的字段结构。

---

## 2. 路由分类与特例

### 2.1 纳入统一 JSON Envelope 的公共 API

以下路由被视为「对前端 / SDK 暴露的公共 JSON API」，响应应符合上述 envelope 约定：

- `/api/chat`
  - 错误：使用 `{ success: false, error, code, retryable }` envelope。
  - 成功：使用流式响应（`result.toUIMessageStreamResponse`），**不使用 JSON envelope**，属于流式协议特例（见下）。
- `/api/analyze-content`
  - 错误：使用 `{ success: false, error, code, retryable }`，`code` 来自 Web Content / AnalyzeContent 错误码。
  - 成功：返回 `AnalyzeContentResponse`，该类型同时作为 usecase 返回类型与 HTTP 协议模型（包含 `success` 等字段）。
- `/api/generate-images`
  - 成功 / 失败：均使用 `GenerateImageResponse`，内部包含 `success` / `error` / `code` / `retryable` 等字段。
- `/api/storage/upload`
  - 成功：`{ success: true, data: { ...uploadResult } }`
  - 失败：`{ success: false, error, code, retryable }`，`code` 为 Storage 相关错误码。
- `/api/distribute-credits`
  - 成功：`{ success: true, data: { usersCount, processedCount, errorCount } }`
  - 失败（Job 内部错误）：`{ success: false, error, code: CREDITS_DISTRIBUTION_FAILED, retryable }`
  - **注意**：Basic Auth 失败行为见后文「认证与 401 特例」。

这些路由的错误 envelope 行为与 DomainError / ErrorCodes 的映射在 `docs/error-logging.md` 中有更详细说明。

### 2.2 特例：流式接口 / Webhook / 健康检查

以下路由出于协议或使用场景原因，不完全遵循统一 JSON envelope：

- `/api/chat`（流式 Chat 接口）
  - 成功：通过 `result.toUIMessageStreamResponse` 返回流式响应（如 SSE / chunked stream），**不使用 JSON envelope**。
  - 错误：若在 route 层捕获到 `DomainError` 或其它异常，则返回 JSON envelope（参见上节），推荐前端在建立流连接前进行必要的预检查。
  - 前端 / SDK 应使用专门的 Chat 客户端处理该流式协议，而不是复用 `unwrapEnvelopeOrThrowDomainError` 等通用 JSON helper。

- `/api/webhooks/stripe`
  - 这是 Stripe 的 Provider 回调入口，不面向浏览器 / 前端直接调用。
  - 成功：当前返回 `{ received: true }`，**不包含 `success` 字段**。
  - 失败：
    - `DomainError`：返回 `{ success: false, error, code, retryable }` envelope，并根据 `retryable` 等信息映射 HTTP 状态码。
    - 非 `DomainError`：返回 `{ success: false, error: 'Webhook handler failed', code, retryable: true }`，`code` 使用 webhook 专用错误码（见 `ErrorCodes`）。
  - 由于 Stripe 仅根据是否为 2xx 来判断成功 / 重试，body 主要用于内部可观测性，本项目不承诺为该路由提供统一的前端 JSON 协议。

- `/api/ping`
  - 仅用于健康检查 / uptime 监控，当前响应为 `{ message: 'pong' }`。
  - 不包含 `success` / `code` 字段，**不属于统一 JSON envelope 范畴**。
  - 外部监控工具（如 Uptime Kuma）应仅以 HTTP 状态码和简单 body 判断服务是否存活，而不依赖任何 envelope 字段。

在编写前端 / SDK 时，建议只对「公共 JSON API」部分使用统一的 envelope 解析逻辑，`/api/chat`（流式）、`/api/webhooks/stripe`、`/api/ping` 则通过专用客户端或简单健康检查逻辑处理。

---

## 3. 认证与 401 行为

### 3.1 `ensureApiUser` 的统一行为

大部分面向登录用户的 API（如 `/api/chat`、`/api/analyze-content`、`/api/generate-images`、`/api/storage/upload`）都会通过 `ensureApiUser` 做认证：

- 成功：返回 `{ ok: true, user, response: undefined }`，route 继续执行。
- 失败：返回 `{ ok: false, response }`，其中 `response` 是带 JSON envelope 的 `NextResponse`，通常形如：

  ```json
  {
    "success": false,
    "error": "Unauthorized",
    "code": "AUTH_UNAUTHORIZED",
    "retryable": false
  }
  ```

前端 / SDK 可以假定：

- 对需要登录态的公共 JSON API 来说，401 响应的 body 将包含统一的错误 envelope，并使用 `ErrorCodes.AuthUnauthorized`（或其他 Auth 相关错误码）。

### 3.2 `distribute-credits` Basic Auth 特例

`/api/distribute-credits` 是**内部 cron-only 接口**，通过 Basic Auth 保护，通常由调度器或运维脚本调用，而非浏览器前端：

- 认证成功：如前文所述，返回 JSON envelope（成功或 Job 内部错误）。
- 认证失败：当前实现返回纯文本响应：

  ```http
  HTTP/1.1 401 Unauthorized
  WWW-Authenticate: Basic realm="Secure Area"

  Unauthorized
  ```

约定：

- 该路由的 401 响应 **不承诺走 JSON envelope**，调用方应只依赖 HTTP 状态码和 `WWW-Authenticate` 头做处理。
- 若未来需要通过统一 SDK 调用 cron-only 接口，可考虑在保持 `WWW-Authenticate` 的前提下，将 body 升级为：

  ```json
  {
    "success": false,
    "error": "Unauthorized",
    "code": "AUTH_UNAUTHORIZED_CRON",
    "retryable": false
  }
  ```

  并在 `ErrorCodes` 中新增相应错误码，届时需要同步更新本协议文档。

---

## 4. 前端 / SDK 使用建议

### 4.1 统一 JSON API 的建议用法

- 对于被纳入统一 JSON envelope 的公共 API，前端 / SDK 可以实现类似的 helper：

  ```ts
  function unwrapEnvelopeOrThrowDomainError<T>(response: SuccessEnvelope<T> | ErrorEnvelope): T {
    if (!response.success) {
      // 将错误包装为前端可识别的 DomainError-like 对象
      throw {
        code: response.code,
        message: response.error,
        retryable: response.retryable,
      };
    }

    // S1: { success: true, data }
    if ('data' in response) return response.data as T;

    // S2: { success: true, ...domainFields }
    const { success, ...rest } = response;
    return rest as T;
  }
  ```

- 在 UI 层，推荐结合 `getDomainErrorMessage`、`domain-error-ui-registry` 等工具，将错误码映射成统一的 UI 行为（toast / 跳转等），具体见 `docs/error-logging.md` 与前端相关文档。

### 4.2 特例路由的调用方式

- `/api/chat`：
  - 使用专门的 Chat 客户端或 streaming Hook 处理流式响应，而不是 `fetch().json()`。
  - 当握手失败 / 连接中断时，如有 JSON 错误返回，可复用统一的 envelope 解析逻辑。

- `/api/webhooks/stripe`：
  - 仅由 Stripe 调用，内部逻辑主要依赖 HTTP 状态码和日志；不建议在前端 / SDK 中直接调用。

- `/api/ping`：
  - 用于 uptime 监控，可以通过简单的 `fetch('/api/ping')` 检查 `status` 是否为 2xx，以及 body 中 `message === 'pong'`。
  - 不应假设其响应结构中存在 `success` / `code` 等字段。

---

## 5. 新增 API 时的 Checklist

当你新增一个 `/api/*` 路由时，建议按照以下步骤确保协议一致性：

1. 确认该 API 是否面向前端 / SDK 暴露：
   - 是 → 按统一 JSON envelope 设计成功 / 失败结构。
   - 否（如 Webhook / 健康检查 / cron-only）→ 在路由实现和相关文档中明确标记为特例。
2. 是否需要登录态：
   - 是 → 优先使用 `ensureApiUser` 做认证，并复用其返回的 JSON envelope。
   - 否 → 在 route 内自行决定 401 的 body 结构，并在文档中说明是否遵循统一 envelope。
3. 使用 `ErrorCodes` 中已有错误码，必要时：
   - 在 `src/lib/server/error-codes.ts` 中新增常量。
   - 在 `docs/error-codes.md` 中补充说明。
4. 在 `docs/error-logging.md` 的 API 合规表中记录该路由的 envelope 状态，保持文档与实现同步。

通过上述约定，可以在不强行修改所有历史 API 的前提下，让「公共 JSON API」在结构上尽可能统一，同时将 Webhook / Ping / cron-only 等特例用文档和类型隔离开来，降低前后端的心智负担。

