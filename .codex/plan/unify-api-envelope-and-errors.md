# Plan: unify-api-envelope-and-errors

## 背景与目标

用户提出的 API Routes 相关问题（初始聚焦 1-4，后续扩展到 5-7）：

1. **路由间 error envelope 风格不统一（P1）**
   - 多数 `/api/*` 路由使用 `{ success, data }` / `{ success, error, code, retryable }`。
   - `/api/webhooks/stripe` 成功分支返回 `{ received: true }`，早期版本错误分支缺少 `success` 字段。
   - `/api/ping` 返回 `{ message: 'pong' }`，不包含 envelope。
   - 风险：前端 / SDK 若统一通过 envelope（如 `unwrapEnvelopeOrThrowDomainError`）处理，会在 webhook / ping / 流式接口上遇到特例，心智负担增加。

2. **401 / 认证失败响应形态不统一（P1）**
   - 大多数路由通过 `ensureApiUser` 返回统一 JSON envelope 的 `authResult.response`。
   - `/api/distribute-credits` Basic Auth 失败时返回纯文本 `401 Unauthorized`，附带 `WWW-Authenticate` 头。
   - 风险：客户端无法统一依赖 `code=AUTH_UNAUTHORIZED` 做 401 分支，需要对 cron 接口写特例。

3. **`/api/analyze-content` 成功响应透传 usecase（P2）**
   - Route 层对成功分支直接 `NextResponse.json(result.response, { status: result.status })`，`result.response` 来自 usecase。
   - 风险：HTTP 协议定义“下沉”到 usecase，Route 不再是统一 HTTP 协议收口；未来若要调整 envelope，耦合度较高。

4. **Stripe webhook 非 DomainError 分支错误码可观测性（P2）**
   - 当前实现中非 `DomainError` 分支已返回 `{ success: false, error: 'Webhook handler failed', code: ErrorCodes.UnexpectedError, retryable: true }`。
   - 风险：与其它使用 `UNEXPECTED_ERROR` 的路径混在一起，监控/告警难以专门聚合 “Stripe Webhook 未预期异常”。

约束条件：

- 路由已在生产环境使用，优先避免 breaking change。
- 统一 envelope 以“公共 JSON API”为主，对 Webhook / ping / cron-only 接口允许存在特例。

最终目标：

- 明确「公共 JSON API」的统一 envelope 协议（成功/失败结构），并文档化。
- 将 Webhook / ping / cron-only 路由标记为特例，解释其协议差异。
- 对 `/api/analyze-content` 的协议边界进行收口说明。
- 为 Stripe Webhook 未预期异常提供更细粒度的错误码，提升可观测性。

## 方案选择

在构思阶段评估了两类方案：

- 方案 1：**保守统一 + 文档收口 + webhook 错误码增强（推荐）**
  - 对公共 JSON API 使用统一 envelope，但保持现有结构的向后兼容。
  - `ping` / `webhooks/stripe` / `distribute-credits` 标记为特例，通过文档解释，不强行套用 envelope。
  - 在 Stripe Webhook 非 `DomainError` 分支引入更具体的错误码。
- 方案 2：**强一致 envelope + 统一 401 + Webhook/Ping 也纳入协议**
  - 所有 JSON 响应（包括 ping / Webhook / cron-only）统一 envelope 结构。
  - `distribute-credits` 的 401 也统一为 JSON envelope。
  - 调整 `/api/chat` 流式响应，尝试套入 envelope。

考虑到生产环境已有依赖及变更风险，本次任务选择 **方案 1**。

## 执行步骤（与 update_plan 对齐）

1. **确定协议文档位置与路由分类（已完成）**
   - 位置：在 `docs/` 下新增 `docs/api-protocol.md`，集中说明 HTTP API 协议与特例。
   - 路由分类：
     - 公共 JSON API：`/api/chat`（错误 JSON + 成功流式）、`/api/analyze-content`、`/api/generate-images`、`/api/storage/upload`、`/api/distribute-credits`。
     - 特例：`/api/webhooks/stripe`（Provider 回调）、`/api/ping`（健康检查）、`/api/distribute-credits` 的 Basic Auth 401。

2. **编写统一 API 协议与特例说明文档（已完成）**
   - 新增 `docs/api-protocol.md`，内容包括：
     - 统一 JSON envelope 模型：
       - 成功：`{ success: true, data: T }` 或 `({ success: true } & T)`。
       - 失败：`{ success: false, error: string, code: string, retryable?: boolean }`。
     - 路由清单与分类：
       - 公共 JSON API 各自的成功/失败形态。
       - 特例：流式 Chat、Stripe Webhook、ping、cron-only 认证失败行为。
     - 新增 API 时的 Checklist。
   - 在 `docs/developer-guide.md` 中补充该文档链接。
   - 在 `docs/error-logging.md` 中引用 `docs/api-protocol.md` 作为 API envelope 详细说明，并明确特例路由不强制统一。

3. **补充认证与 401 行为相关说明（已完成）**
   - 在 `docs/api-protocol.md` 中：
     - 说明 `ensureApiUser` 的统一行为：成功返回 `user`，失败返回带 JSON envelope 的 `NextResponse`，通常使用 `AUTH_UNAUTHORIZED`。
     - 将 `/api/distribute-credits` 标记为 Basic Auth + cron-only 特例：
       - 当前 401 为纯文本响应 + `WWW-Authenticate`；
       - 文档中说明“不承诺 JSON envelope”，仅建议根据 HTTP 状态码 & 头做处理；
       - 预留未来升级为 JSON envelope 的方案（增加 `AUTH_UNAUTHORIZED_CRON` 之类的错误码）。

4. **收口 `/api/analyze-content` 协议与注释（已完成）**
   - 在 `src/ai/text/utils/web-content-analyzer.ts` 中，为 `AnalyzeContentResponse` 增加注释：
     - 说明其既是 usecase 返回类型，也是 `/api/analyze-content` 的 HTTP 协议模型；
     - `success` / `error` / `code` / `retryable` 字段遵循统一 API envelope 约定。
   - 在 `docs/api-protocol.md` 中对应章节写明这一点，将现状文档化，减少隐式约定。

5. **新增 Webhook 专用错误码并应用（已完成）**
   - 在 `src/lib/server/error-codes.ts`：
     - 新增常量：`StripeWebhookUnexpectedError: 'STRIPE_WEBHOOK_UNEXPECTED_ERROR'`。
     - 新增类型别名：`WebhookErrorCode`。
   - 在 `src/app/api/webhooks/stripe/route.ts` 中：
     - 将非 `DomainError` 分支的 `code` 从 `ErrorCodes.UnexpectedError` 替换为 `ErrorCodes.StripeWebhookUnexpectedError`。
     - 保持 HTTP 状态码与 `success` / `retryable` 语义不变，仅细化错误码，方便监控聚合 Webhook 未预期异常。
   - 在 `docs/error-codes.md` 中新增「Webhooks / Provider 回调」小节，记录 `STRIPE_WEBHOOK_UNEXPECTED_ERROR` 的用途。

6. **补充前端 / SDK 使用指引（已完成）**
   - 在新建的 `docs/api-protocol.md` 中增加「前端 / SDK 使用建议」：
     - 对纳入统一 JSON envelope 的公共 API，给出 `unwrapEnvelopeOrThrowDomainError` 风格的示例，兼容 S1/S2 成功形态。
     - 对流式 Chat、Stripe Webhook、ping 等特例，给出调用建议与边界说明。
   - 在 `README.md` 的 `Error codes & UI Handling` 一节中引用 `docs/api-protocol.md`，作为统一协议与特例说明的入口。

7. **在 .codex 中记录本次任务计划与决策（本文件，已完成）**
   - 将任务背景、问题列表、约束条件、选定方案及执行步骤记录在 `.codex/plan/unify-api-envelope-and-errors.md` 中，便于后续迭代和新成员理解相关决策。

## 后续可选改进方向（非本次任务范围）

- 若未来需要更强的一致性，可考虑：
  - 为所有公共 JSON API 抽象一个服务器端 helper（如 `ok(data)` / `fail(code, message, retryable)`），统一构造 envelope；
  - 为 cron-only 接口（如 `/api/distribute-credits`）在保持 `WWW-Authenticate` 的同时，引入 JSON envelope 版本，并在文档中标记为 v2 行为；
  - 为 `/api/chat` 流式响应增加“握手阶段”的 JSON envelope（例如先返回 headers 或首个 chunk 作为状态描述），在兼容既有客户端的前提下，让错误处理更一致。

当前版本的目标是：在基本不破坏现有客户端的前提下，让公共 JSON API 的 envelope 协议更加清晰和可文档化，同时为 Stripe Webhook 未预期异常提供更好的可观测性。

## 补充：错误码命名、Envelope Helper 与 i18n 校验（问题 5 / 6 / 7）

在统一 envelope 协议的过程中，进一步识别并纳入以下三类问题：

5. **ErrorCodes 与 docs/error-codes.md 同步与命名前缀策略（P1）**
   - 背景：
     - Web Content 领域存在两条错误码前缀线：`AI_CONTENT_*` 与 `ANALYZE_CONTENT_*`。
     - 当前实现中 `/api/analyze-content` 路由在请求体/参数错误时仍返回 `AI_CONTENT_VALIDATION_ERROR`，而文档中已经引入 `ANALYZE_CONTENT_INVALID_JSON/ANALYZE_CONTENT_INVALID_PARAMS`。
   - 方案（采纳 **5-B**）：
     - 将 `ANALYZE_CONTENT_*` 明确为 **`/api/analyze-content` 路由入口的请求体验证错误码**：
       - JSON 解析失败 → `ANALYZE_CONTENT_INVALID_JSON`。
       - 请求体 schema 校验失败 → `ANALYZE_CONTENT_INVALID_PARAMS`。
     - 将 `AI_CONTENT_*` 系列保留为 **WebContentAnalyzer 领域过程错误码**（抓取/分析/网络/限流等）。
     - `/api/analyze-content` 成功/失败 envelope 继续遵循统一协议，仅调整 `code` 字段：
       - 路由入口错误 → 使用 `ANALYZE_CONTENT_*`。
       - Usecase / WebContentAnalyzer 过程错误 → 使用 `AI_CONTENT_*`。
     - 对应更新：
       - Route 实现：`src/app/api/analyze-content/route.ts`。
       - 测试：`src/app/api/__tests__/analyze-content-route.test.ts` 预期值从 `AI_CONTENT_VALIDATION_ERROR` 切换为 `ANALYZE_CONTENT_*`。
       - 文档：`docs/ai-lifecycle.md` 与 `docs/error-codes.md` 中补充“路由入口 vs 领域过程”的错误码分层说明。

6. **DomainError + envelope 统一 helper（P2）**
   - 背景：
     - `DomainError` / `EnvelopeWithDomainError` / `unwrapEnvelopeOrThrowDomainError` 已经为前端消费提供了统一模型。
     - 服务器端 API Route 仍在各处手写 `{ success, error, code, retryable }`，缺少轻量 helper，增加了新增路由/修改时的不一致风险。
   - 方案（采纳 **6-A**）：
     - 在 `src/lib/domain-error-utils.ts` 中新增与 envelope 相关的类型与 helper，实现**纯 JSON 数据层封装**（不绑定 NextResponse）：
       - `type SuccessEnvelope<T> = T & { success: true };`
       - `type ErrorEnvelope = { success: false; error: string; code: ErrorCode; retryable: boolean };`
       - `createSuccessEnvelope<T>(data: T): SuccessEnvelope<{ data: T }>`。
       - `createErrorEnvelope(code: ErrorCode, message: string, retryable: boolean): ErrorEnvelope`。
     - 在核心公共 JSON API Route 中渐进替换手写 envelope：
       - `/api/chat`（JSON 错误分支）；
       - `/api/generate-images`；
       - `/api/analyze-content`；
       - `/api/storage/upload`；
       - `/api/distribute-credits`；
       - `/api/webhooks/stripe` 的 DomainError 分支。
     - 约束：
       - 不改变 HTTP 状态码与错误码字符串值；
       - 仅将 body 构造方式统一为 helper，保持向后兼容；
       - helper 放置在 `domain-error-utils`，与 `EnvelopeWithDomainError` / `getDomainErrorMessage` 同模块，保持语义聚合。

7. **DOMAIN_ERROR_MESSAGES 与 i18n key 的静态校验（P2）**
   - 背景：
     - `src/lib/domain-error-utils.ts` 中的 `DOMAIN_ERROR_MESSAGES` 维护了错误码到 i18n key 的映射（例如 `AITextPage.analyzer.errors.*`、`AIImagePage.errors.*`、`Dashboard.settings.credits.*`）。
     - 目前完全依赖人工约定与 code review，同步到 `messages/en.json` / `messages/zh.json`，缺少编译期保障。
   - 方案（采纳 **7-A**）：
     - 新增一个专用 TypeScript 脚本：`scripts/check-domain-error-messages.ts`，通过 `tsx` 执行：
       - 从 `DOMAIN_ERROR_MESSAGES` 读取所有 `definition.key`。
       - 读取 `messages/en.json` 与 `messages/zh.json`，以 `.` 分割路径递归检查 key 是否存在。
       - 若发现任意缺失 key：
         - 在控制台输出详细报告（包含错误码与缺失的 i18n key）。
         - 使用 `process.exit(1)` 令命令失败。
     - 在 `package.json` 中新增脚本：
       - `"check:domain-errors-i18n": "tsx scripts/check-domain-error-messages.ts"`。
     - CI 集成：
       - 在 CI pipeline 中运行 `pnpm check:domain-errors-i18n`，一旦发现缺失 key 即 fail，强制保证 `DOMAIN_ERROR_MESSAGES` 与 messages 文件同步。
     - 文档：
       - 在 `docs/developer-guide.md` “错误码 & UI 处理” 或相关章节中补充该脚本说明和使用建议。

通过以上扩展，本计划不仅统一了公共 JSON API 的 envelope 协议与 Stripe Webhook 错误码，还进一步规范了 Web Content 域错误码的分层策略，并为 DomainError + i18n 映射引入了编译期校验，降低长期维护成本。
