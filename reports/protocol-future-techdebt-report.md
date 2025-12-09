---
title: 协议 / 错误码专项审查
description: 基于 `.codex/rules/api-protocol-and-error-codes-best-practices.md` 的静态巡检
date: 2025-12-09
---

## 范围与方法
- **覆盖目录**：`src/app/api/**`, `src/lib/server/error-codes.ts`, `src/lib/domain-error-utils.ts`, `docs/api-reference.md`, `docs/error-codes.md`, `docs/error-logging.md`、相关 usecase/handler（Stripe / Creem Webhook 等）。
- **检查要点**：
  1. HTTP API 是否遵守统一 Envelope（或在文档中被允许的特例，例如 `/api/chat` 流式、`/api/ping` 健康检查）。
  2. 路由入口错误码（`{ROUTE}_*`）与领域错误码（`AI_*`, `CREDITS_*` 等）是否按分层使用；`DomainError` 捕获是否映射合适的 HTTP 状态。
  3. 错误码定义 ↔ 文档 ↔ 前端映射是否一致（`ErrorCodes`, `docs/error-codes.md`, `DOMAIN_ERROR_MESSAGES`, UI registry）。
  4. `docs/api-reference.md` 是否登记所有对外 `/api/*` 与 Webhook，避免协议漂移。
- **方法**：纯静态审查（未运行 `pnpm check:protocol` 或测试），依据最佳实践 checklist + 代码阅读 + 文档交叉比对。

## 总体评估
- ✅ 核心 AI / Storage / Docs Search / Cron 路由均按 Envelope + 错误码规范实现；Stripe Webhook 对安全失败的日志、错误码与 HTTP 状态相互匹配。
- ✅ `ErrorCodes`, `docs/error-codes.md`, `DOMAIN_ERROR_MESSAGES`, `domain-error-ui-registry` 保持一致；`scripts/check-protocol-and-errors.ts` 提供静态守护。
- ⚠️ Web 内容分析入口、Creem Webhook 以及内部 Dev API 存在与最佳实践不符的错误码 / 文档 / Envelope 细节，详见下文。

## 发现与建议

### 1. `/api/analyze-content` 未使用入口级错误码（阻挡修复优先级：高）
- **证据**：
  - 路由对无效 JSON / 参数的响应，直接将 `WebContentAnalyzerError`（`AI_CONTENT_*`）透出（`src/app/api/analyze-content/route.ts:56-123`），未使用专门定义的 `ANALYZE_CONTENT_INVALID_JSON` / `ANALYZE_CONTENT_INVALID_PARAMS`。
  - `ErrorCodes.AnalyzeContentInvalidJson` / `AnalyzeContentInvalidParams` 仅在 `error-codes.ts` 与文档中出现，未被任何实现引用（`rg -n \"AnalyzeContentInvalid\"`）。
- **影响**：
  - 无法区分“入口参数错误”与“下游内容分析错误”，与最佳实践《入口级错误码 vs 领域错误码分层》冲突，导致前端 / 日志难以准确定位责任。
  - 文档 (`docs/error-codes.md` 与 `docs/error-logging.md`) 描述的 `ANALYZE_CONTENT_*` 永远不会触发，协议与实现逐渐漂移。
- **建议**：
  1. 在路由中保留 `WebContentAnalyzerError` 作为领域错误，但在解析阶段显式返回 `ErrorCodes.AnalyzeContentInvalidJson/Params`（与 `/api/chat`、`/api/generate-images` 一致）。
  2. `WebContentAnalyzerError` 留作业务链路内部错误（抓取/分析/AI 调用），形成“入口（`ANALYZE_CONTENT_*`）→ 领域（`AI_CONTENT_*`）”的清晰分层。
  3. 合并修复后补充单元/集成测试，确保错误码切换不会被后续改动回滚。

### 2. Creem Webhook 的安全失败暴露为 `UNEXPECTED_ERROR`（阻挡修复优先级：高）——**已修复**
- **证据**：
  - `handleCreemWebhook` 对缺失 payload / signature 时抛出的 `DomainError` 使用 `ErrorCodes.UnexpectedError`（`src/lib/server/creem-webhook.ts:48-80`），`retryable: false`，并未记录明确的安全原因。
  - 路由层在 payload 为空时同样返回 `{ success: false, code: UNEXPECTED_ERROR }`（`src/app/api/webhooks/creem/route.ts:17-35`）。
- **影响**：
  - 与 Stripe Webhook 已实现的安全策略不一致（Stripe 会记录 `reason` 并返回 `PAYMENT_SECURITY_VIOLATION`）。
  - 运维无法通过错误码识别“请求未通过签名验证 / 请求体缺失”等安全事件，给攻击面分析和监控带来困难。
- **当前状态**：
  - `src/lib/server/creem-webhook.ts` 中，payload 为空或缺少/验签失败的场景均抛出 `ErrorCodes.PaymentSecurityViolation`，并通过 `reason: 'missing-payload' | 'missing-signature' | 'invalid-signature'` + `signatureHeader` 记录结构化日志。  
  - `src/app/api/webhooks/creem/route.ts` 不再在路由层返回 `UNEXPECTED_ERROR`，而是透传 `DomainError` 并根据 `error.code` / `retryable` 选择 HTTP 状态（安全错误统一为 400）。  
  - `docs/payment-lifecycle.md` 与 `docs/api-reference.md` 已补充 Creem Webhook 的错误矩阵与 header 说明。
- **后续建议**：
  - 可在 `scripts/check-protocol-and-errors.ts` 中加入轻量静态检查，确保未来改动不会将安全错误退回到 `UNEXPECTED_ERROR`。  
  - 建议运维侧基于 `span = api.webhooks.creem` + `code = PAYMENT_SECURITY_VIOLATION` + `reason` 字段配置安全告警。

### 3. `/api/dev/access-reconciliation` 未复用 Envelope & 文档缺失（阻挡修复优先级：中）
- **证据**：
  - 该路由直接返回 `NextResponse.json({ error: 'Missing userId...' })` 等结构（`src/app/api/dev/access-reconciliation/route.ts:18-52`），未携带 `success` / `code` / `retryable`，也未引用 `ErrorCodes`。
  - `docs/api-reference.md` 未登记该端点，导致 Dev 工具协议需要阅读源码才能得知。
- **影响**：
  - 虽是 dev-only，但 PR/CI 环境也会使用，若未来需要在 staging 暴露该工具，将迫使客户端写特例；同时 `scripts/check-protocol-and-errors.ts` 也无法覆盖。
  - 文档缺失使“所有 `/api/*` 均在 Reference 中对齐”的治理目标落空（best-practices checklist 第 4 条）。
- **建议**：
  1. 将返回值改为标准 Envelope（或在请求成功时仍返回 `success: true` + `data`，错误时附 `ErrorCodes.AuthUnauthorized` / `UnexpectedError` 等）。
  2. 在 `docs/api-reference.md` 增加 “GET `/api/dev/access-reconciliation`（仅非生产环境）” 章节，描述鉴权/输入/输出/错误码，或明确标注“仅开发模式启用”。

### 4. `POST /api/webhooks/creem` 未在 API Reference 中登记（阻挡修复优先级：中）
- **证据**：`docs/api-reference.md` 仅描述了 Stripe Webhook、未覆盖 Creem Webhook（`rg -n \"creem\" docs/api-reference.md` 无结果）。
- **影响**：
  - 不易发现该 Webhook 的鉴权方式、错误码、重试语义，与最佳实践 “特例需在文档中明确” 不符。
  - 当支付团队查看协议地图或技术债矩阵时， Creem Webhook 状态无法在文档中被引用，增加协作成本。
- **建议**：
  - 在 Reference 文档中新增 `POST /api/webhooks/creem` 章节（类似 Stripe），描述所需 Header (`creem-signature`)、payload 原样转发、可能的错误码（`PAYMENT_SECURITY_VIOLATION`, `CREEM_WEBHOOK_MISCONFIGURED`, `UNEXPECTED_ERROR` 等）。
  - 与 #2 建议配套，确保文档、实现与错误码矩阵保持一致。

## 后续工作建议
1. **优先修复入口错误码与 Webhook 安全码**：完成上述 #1 / #2 后，重新运行 `pnpm check:protocol` + 关键路由测试，更新 `docs/error-codes.md` 中相应描述。
2. **文档同步**：在 `docs/api-reference.md` 增补 Creem Webhook 与 Dev API 章节；若不打算公开 Dev API，应在 Reference 中显式声明“仅开发模式可用”并说明差异。
3. **脚本增强（可选）**：为 `scripts/check-protocol-and-errors.ts` 增加 “入口错误码是否使用” 的检查，例如扫描 `/api/*` 中 `validate` 分支的 `ErrorCodes` 引用，减少未来漂移。

本报告可作为后续 PR / 技术债任务的输入，建议在修复完成后回写 `.codex/plan/protocol-future-techdebt-report.md` 以同步状态。
