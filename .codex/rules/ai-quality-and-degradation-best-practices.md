---
title: AI 功能质量与降级策略最佳实践
description: 基于 MkSaaS 模板与 OpenAI SDK 的 AI 可靠性与体验设计规范
---

## 适用范围

- AI 功能：`src/ai/chat/*`、`src/ai/image/*`、`src/ai/text/*`
- 对应 API：`src/app/api/chat`、`generate-images`、`analyze-content`
- Credits 与使用统计：`src/credits/*`、`src/analytics/*`

## 设计目标

- 在模型、网络或配额异常时，AI 功能能够“优雅失败”，不拖垮整体产品体验。
- 错误原因可观测，可被上报与告警。
- 前端有一致的错误 UI 与重试体验。

## 核心原则

1. **错误分层与分类**
   - 入口层（API route）：
     - 区分：请求体错误、鉴权/限流错误、下游模型错误、内部错误。
     - 使用统一 JSON envelope 与错误码（参考 `unify-api-envelope-and-errors`）。
   - 领域层（AI usecase）：
     - 为业务错误定义 DomainError（如内容违反策略、输入超限）。
   - SDK 层（OpenAI 等）：
     - 利用官方 SDK 的错误类型和自动重试能力（如 429/5xx）。

2. **降级优先保证“页面可用”而非“AI 必须成功”**
   - Chat 场景：
     - 模型失败时，保留已有对话历史与用户输入，在 UI 中展示“本次回复失败，可稍后重试”。
   - Image / Text 场景：
     - 失败时优先提示“无需重复支付”的信息，并清晰说明不会重复扣费。

3. **合理使用 SDK 的重试与超时**
   - OpenAI SDK：
     - 利用自动重试（针对 408/409/429/5xx）但设置合理 `maxRetries` 上限。
     - 为每次请求设置超时，避免请求无限挂起。
   - 多次重试失败后，尽快返回清晰的错误信息与错误码，例如 `AI_PROVIDER_UNAVAILABLE`。

4. **输入与输出的保护**
   - 输入层：
     - 对 prompt / 参数做严格 schema 校验（Zod），防止意外 payload。
     - 对用户可控的字符串做长度限制与截断。
   - 输出层：
     - 对模型输出做安全过滤（如富文本内容、HTML 标签等）。
     - 对结构化输出使用 schema 校验与 parse helper（如 Zod）。

5. **可观测性与灰度发布**
   - 为每条 AI ���求打 `requestId`，并在日志中串联 userId、endpoint、model、错误码。
   - 切换模型或调整 prompt 时，通过配置或 Feature Flag 控制范围，避免一次性全量变更。

## 实践要点（结合本仓库）

1. API route 侧
   - `src/app/api/chat/route.ts`：
     - 对 DomainError 使用统一 envelope。
     - 对 OpenAI SDK 异常使用统一错误码（如 `AI_CHAT_PROVIDER_ERROR`），并区分是否可重试。
   - `generate-images` / `analyze-content` route：
     - 保持与 Chat 相同的 envelope 与错误码风格。

2. SDK 使用模式
   - 在调用 OpenAI SDK 时：
     - 明确设置 timeout 与 `maxRetries`，避免长时间阻塞。
     - 捕获 `APIError` 子类，根据 status 码映射到内部错误码：
       - 401/403：配置错误或权限问题。
       - 429：限流，可提示“稍后重试”。
       - 5xx：服务不可用，可提示“服务异常”并记录告警。

3. 前端体验
   - Chat / Image / Text UI 组件：
     - 使用统一的错误提示组件与文案（来自 `messages/*`），避免各自 invent 文案。
     - 对流式响应中断时，保留用户输入并允许一键重试。

4. 与 Credits 与 Analytics 的联动
   - 出错时 Credits 策略：
     - 请求在模型调用前即失败（鉴权/校验/限流）→ 不扣费。
     - 模型调用中断或网络错误 → 可以选择按部分消耗扣费，但需全局一致。
   - 在 Analytics 中记录：
     - 各类错误的出现频率，用于发现模型或配置问题。

## 反模式（应避免）

- 将模型/网络错误直接透传给前端，而没有统一 envelope 与用户友好提示。
- 在 UI 中对每个 endpoint 手写不同风格的“报错 Toast”。
- 缺乏超时与重试策略，导致请求挂死或用户长时间无反馈。

## Checklist

- [ ] 所有 AI API 都有明确的错误分类与错误码。
- [ ] 在前端任意一个 AI 功能中，失败时用户都能看到一致的提示与重试入口。
- [ ] 日志中能够根据 requestId/userId 快速定位一次失败的请求与上下游错误。

## 实施进度 Checklist

- 已基本符合
  - [x] AI API 路由 `/api/chat`、`/api/generate-images`、`/api/analyze-content` 均区分了请求体验证错误、DomainError 与 UnexpectedError，并使用统一 JSON envelope 与 `ErrorCodes`。
  - [x] `generate-image-with-credits` 使用 `withTimeout` 包裹模型调用，对超时与 Provider 错误分别映射为 `ImageTimeout` 与 `ImageProviderError` 等错误码。
  - [x] 文本分析链路通过 `WebContentAnalyzerError` + `logAnalyzerErrorServer` 记录错误上下文，配合 `ErrorType` / `ErrorSeverity` 实现分级观测。
- 尚待调整 / 确认
  - [ ] OpenAI / 其它 AI SDK 的调用是否统一配置了合理的 `maxRetries` 与超时参数，并在配置层集中管理，避免各 usecase 各自硬编码。
  - [ ] 前端 Chat / Image / Text UI 是否已经统一使用一套错误展示组件和 i18n 文案（如 `AITextPage.*`、`AIImagePage.*`），避免页面间错误体验不一致。
  - [ ] 对 AI 请求的 requestId 是否在客户端、服务端日志以及 Analytics 模块中完整贯通，支持按 requestId 追踪一次调用的全链路。
