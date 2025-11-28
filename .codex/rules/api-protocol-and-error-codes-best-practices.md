---
title: API 协议与错误码设计最佳实践
description: 基于 MkSaaS 模板的统一 JSON Envelope 协议与错误码体系规范
---

## 适用范围

- HTTP API：`src/app/api/*`
- 错误码与 DomainError：`src/lib/server/error-codes.ts`、`src/lib/domain-error-utils.ts`
- 相关文档：`docs/error-codes.md`、`docs/error-logging.md`、`docs/ai-lifecycle.md`

## 设计目标

- 对“公共 JSON API”提供统一、稳定的响应结构（成功 / 失败）。
- 错误码具备清晰的命名空间与分层策略，方便前端与日志系统消费。
- 通过文档与脚本保证错误码、文案与实现三者长期保持一致。

## 核心原则

1. **公共 JSON API 使用统一 Envelope**
   - 成功：
     - 统一为 `{ success: true, data: T }` 或 `({ success: true } & T)`。
   - 失败：
     - 统一为 `{ success: false, error: string, code: ErrorCode, retryable?: boolean }`。
   - 特例：
     - Webhook（`/api/webhooks/stripe`）、健康检查（`/api/ping`）、纯文本 Basic Auth 接口（`/api/distribute-credits` 的 401）允许与公共 JSON API 不同，但必须在文档中标明。

2. **错误码命名分层**
   - 路由入口级错误：
     - 以 `{ROUTE}_*` 或 `{DOMAIN_ACTION}_*` 为前缀，例如：
       - `ANALYZE_CONTENT_INVALID_JSON`，`ANALYZE_CONTENT_INVALID_PARAMS`。
   - 领域过程级错误：
     - 以领域为前缀，例如：
       - `AI_CONTENT_*`（Web 内容分析过程错误）。
       - `AI_IMAGE_*`，`CREDITS_*` 等。
   - 基础设施级错误：
     - 通用错误码，如 `UNEXPECTED_ERROR`，仅用于“无法细分”的系统级异常。

3. **DomainError 与 Envelope 的互操作**
   - 域内错误推荐使用 `DomainError` 表达：
     - 必须携带 `code` 与可选的 `retryable` 信息。
   - API route 捕获 `DomainError` 后：
     - 将其映射为标准 JSON envelope，并选择合适的 HTTP 状态码（通常 `400` 或 `500`）。
   - 客户端消费：
     - 使用 `EnvelopeWithDomainError` + `unwrapEnvelopeOrThrowDomainError` 将 envelope 转换为统一的错误对象。

4. **文档与实现同步**
   - 所有公开错误码必须在 `docs/error-codes.md` 中登记。
   - 与 AI 生命周期、Credits 生命周期等文档保持交叉引用（例如 `docs/ai-lifecycle.md`、`docs/credits-lifecycle.md`）。

## 实践要点（结合本仓库）

1. 路由分类
   - 公共 JSON API：
     - `/api/chat`（错误 JSON + 成功流式）、`/api/analyze-content`、`/api/generate-images`、`/api/storage/upload`、`/api/distribute-credits` 的 200/5xx。
   - 特例：
     - `/api/webhooks/stripe`：成功为 `{ received: true }`，错误为标准 envelope。
     - `/api/ping`：健康检查，可返回简单 JSON，不纳入公共错误码体系。
     - `/api/distribute-credits` 的 401：Basic Auth，返回纯文本 `Unauthorized`。

2. 错误码与 i18n 映射
   - `src/lib/domain-error-utils.ts` 中的 `DOMAIN_ERROR_MESSAGES`：
     - 定义错误码到 i18n key 的映射，例如 `AITextPage.analyzer.errors.*`、`AIImagePage.errors.*`、`Dashboard.settings.credits.*`。
   - 前端统一通过该映射与 `messages/*` 展示错误文案，避免在组件内部重复写字符串。

3. 文档与计划
   - `.codex/plan/unify-api-envelope-and-errors.md` 对统一 envelope 与错误码的方案与实现步骤已有详尽说明。
   - `docs/error-codes.md`、`docs/error-logging.md`、`docs/ai-lifecycle.md` 已对常见错误码、日志上下文与 AI 生命周期做出文档化。

## 反模式（应避免）

- 在新路由中手写随意的 `{ error: '...' }` 结构，不带 `success` / `code` / `retryable`。
- 将领域错误直接映射为 `UNEXPECTED_ERROR`，导致问题定位困难。
- 在前端直接通过字符串匹配错误文案，而不是依赖错误码与 i18n key。

## Checklist

- [ ] 所有公共 JSON API 都使用统一的 `{ success, data }` / `{ success, error, code, retryable }` 结构。
- [ ] 错误码命名遵循“路由入口 / 领域过程 / 基础设施”分层策略。
- [ ] `DomainError` 与 API route 的错误处理逻辑一致，并在前端通过统一 helper 消费。
- [ ] 所有错误码都在 `docs/error-codes.md` 等文档中登记，并与实现保持同步。

## 实施进度 Checklist

- 已基本符合
  - [x] 核心 AI API 路由 `/api/chat`、`/api/generate-images`、`/api/analyze-content`、`/api/storage/upload` 使用统一 JSON envelope 与 `ErrorCodes`。
  - [x] `src/lib/domain-error-utils.ts` 定义了错误码到 i18n key 的映射，并提供 `unwrapEnvelopeOrThrowDomainError` 用于前端统一消费。
  - [x] `docs/error-codes.md`、`docs/error-logging.md`、`docs/ai-lifecycle.md` 对主要错误码与 envelope 行为已有较完整说明。
- 尚待调整 / 确认
  - [ ] 新增或调整 API 路由时，是否全部遵循 `.codex/plan/unify-api-envelope-and-errors.md` 中的约定，避免产生新特例。
  - [ ] 入口级错误码（如 `ANALYZE_CONTENT_*` 系列）与领域级错误码（如 `AI_CONTENT_*` 系列）在文档与实现中是否完全按“入口 vs 领域过程”分层使用。
  - [ ] 错误码与 i18n key 之间的映射是否已经加入静态校验脚本（如 `scripts/check-domain-error-messages.ts`）并在 CI 中强制执行。

