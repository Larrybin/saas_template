---
title: 错误处理与兜底体验最佳实践
description: 基于 MkSaaS 模板的端到端错误处理与用户兜底体验规范
---

## 适用范围

- API 与 DomainError：`src/app/api/*`、`src/lib/domain-errors.ts`、`src/lib/server/error-codes.ts`
- 前端错误 UI：`src/hooks/use-ai-error-ui.ts`、`src/hooks/use-storage-error-ui.ts`、`src/components/shared/*`
- 日志与错误上报：`src/lib/server/logger.ts`、`docs/error-logging.md`
- 兜底逻辑设计：`.codex/rules/兜底逻辑设计原则.md`

## 设计目标

- 用户在遇到错误时得到清晰、可行动的反馈，而不是“白屏或静默失败”。
- 服务端错误被分层记录并可观测，便于排查与告警。
- 错误处理逻辑可复用、可测试，避免散落在各个组件与路由中。

## 核心原则

1. **端到端一致性**
   - 一次错误从“抛出点”到“用户看到的文案”应有完整链路：
     - DomainError / ErrorCodes → JSON envelope → 日志 → i18n key → UI 组件。
   - 禁止在中途“吞掉”错误信息，仅保留模糊提示。

2. **错误分层**
   - 领域层：使用 `DomainError` 表达业务错误（含 code + retryable）。
   - 基础设施层：使用统一的 `ErrorCodes` + envelope 结构。
   - 前端层：使用统一的 Error UI hook / 组件，将错误码映射为用户可理解的文案。

3. **兜底体验优先**
   - 即使服务整体异常，页面也应提供：
     - 基本导航（回首页 / 控制台）。
     - 明确说明（例如“稍后重试”、“联系支持”的指引）。
   - 对 AI/支付/存储等关键操作，应特别关注“不会重复收费、不丢失用户输入”的兜底策略。

4. **错误即数据**
   - 错误不只是日志文本，也是一种业务信号：
     - 将关键错误场景纳入 Analytics，可用于发现产品缺陷。
     - 对高频错误进行分组分析，驱动后续改进。

## 实践要点（结合本仓库）

1. 服务端错误处理
   - API 路由：
     - Chat/Image/Analyze/Storage 路由已对 JSON 解析错误、参数校验错误、DomainError 与 UnexpectedError 做了明确分支。
   - 文本分析链路：
     - 使用 `WebContentAnalyzerError` + `logAnalyzerErrorServer` 为错误打上 `ErrorType` / `ErrorSeverity` 标签，分别处理 validation / network / scraping 等场景。

2. 前端错误 UI
   - AI 相关 UI：
     - `use-ai-error-ui` 负责将 DomainError / ErrorCodes 映射为适合前端展示的结构与文案。
   - 存储相关 UI：
     - `use-storage-error-ui` 封装了 Storage 错误 envelope 的处理逻辑。
   - 推荐做法：
     - 其它新功能的错误展示优先复用这类 hook 或按照相同模式新增，而不是在组件内直接解析 `response.json()`。

3. 文档与规约
   - `.codex/rules/兜底逻辑设计原则.md` 对兜底体验有设计层级的指导。
   - `docs/error-logging.md` 说明了错误日志的等级、结构与上下文字段。

## 反模式（应避免）

- 在 API 中直接 `console.error` 而不使用统一 logger，也不返回结构化错误。
- 在前端组件内直接 `alert(error.message)`，不经统一错误处理层。
- 对用户重要但可恢复的错误（如超时）使用“强烈、致命”语气文案，影响信任感。

## Checklist

- [ ] 所有公共 API 的错误都能被映射到明确的错误码与 i18n key。
- [ ] 前端存在统一的 Error UI hook / 组件供 AI、存储等功能复用。
- [ ] 兜底体验（错误页 / 错误提示）在主要用户路径上已覆盖。
- [ ] 错误日志包含 requestId / userId / endpoint  等关键上下文。

## 实施进度 Checklist

- 已基本符合
  - [x] 核心 AI / Storage 路由已对常见错误场景进行分类处理，并通过 `ErrorCodes` 与 JSON envelope 返回。
  - [x] 文本分析链路使用 `WebContentAnalyzerError` 与专用 error-logging helper，将错误统一记录到服务器日志。
  - [x] 前端已提供 `use-ai-error-ui` 与 `use-storage-error-ui` 等 hook，用于将错误 envelope 映射为 UI 文案。
- 尚待调整 / 确认
  - [ ] 其它新模块在处理错误时是否统一复用 Error UI hook，避免在组件内重复手写错误解析与 Toast 逻辑。
  - [ ] 全站错误页（如 `not-found.tsx` 与全局 error 组件）是否对常见“系统级错误”提供一致的兜底体验。
  - [ ] Analytics / 监控系统中是否有对高频错误码的聚合视图与告警规则。

