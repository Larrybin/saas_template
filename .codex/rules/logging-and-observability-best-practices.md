---
title: 日志、监控与可观测性最佳实践
description: 基于 MkSaaS 模板的结构化日志与可观测性规范
---

## 适用范围

- 日志基础设施：`src/lib/server/logger.ts`、`src/lib/server/job-logger.ts`
- 使用日志的 Usecase 与 API：`src/lib/server/usecases/*`、`src/app/api/*`
- 错误日志与观测文档：`docs/error-logging.md`、`docs/ai-lifecycle.md`、`docs/credits-lifecycle.md`

## 设计目标

- 为每条关键请求生成结构化、可追踪的日志（带 requestId / userId / route 等）。
- 区分 info / warn / error 等级，使告警与排查有的放矢。
- 将日志与错误码、业务 ID（userId、jobRunId、stripeEventId 等）串联起来。

## 核心原则

1. **结构化日志优先**
   - 所有服务端日志通过 `getLogger` / `createJobLogger` 输出结构化 JSON，而非自由文本。
   - 关键字段：
     - `span`：当前逻辑责任域（如 `api.ai.chat`、`usecase.ai.image.generate-with-credits`）。
     - `route`：API 路由路径。
     - `requestId` / `jobRunId` / `userId`：用于链路追踪。

2. **请求级上下文贯穿**
   - API route 中通过 `createLoggerFromHeaders` + `resolveRequestId` 构造 logger。
   - Usecase 调用时通过 `withLogContext` 注入 `requestId` / `userId` 等上下文。
   - Job 场景使用 `createJobLogger` 提供 `jobRunId`，并贯穿整个 Job 执行。

3. **日志等级与内容**
   - info：
     - 成功的关键路径事件（开始、完成、主要状态变更）。
   - warn：
     - 非致命异常、用户输入问题、限流等可恢复场景。
   - error：
     - 不可恢复错误、下游服务异常、数据一致性风险。
   - 严禁在 error 日志中写入敏感信息（完整 token、密码、机密内容等）。

4. **与错误码 / 观察系统联动**
   - 日志中应尽量包含 `code`（ErrorCode）、`retryable` 等信息，便于后续监控系统聚合。
   - 关键领域（AI、Credits、Billing）在文档（如 `docs/ai-lifecycle.md`、`docs/credits-lifecycle.md`）中说明典型日志模式。

## 实践要点（结合本仓库）

1. Logger 基础设施
   - `src/lib/server/logger.ts`：
     - 提供 `getLogger` / `createLoggerFromHeaders` / `resolveRequestId` / `withLogContext` 等工具。
   - `src/lib/server/job-logger.ts`：
     - 为 Job 执行提供 `createJobLogger`，自动生成 `jobRunId` 并写入日志上下文。

2. Usecase & Job
   - AI usecase（`execute-ai-chat-with-billing`、`generate-image-with-credits`、`analyze-web-content-with-credits`）：
     - 对成功/失败、quota 检查、Credits 扣费等关键步骤使用 info/warn/error 日志。
   - Credits 分发 Job (`distribute-credits-job.ts`)：
     - 使用 job logger 记录 jobRunId、处理数量、错误数量等。

3. 文档支持
   - `docs/error-logging.md`：
     - 对日志内容、上下文字段与错误码关系做了规范说明。
   - 其它领域文档（AI、Credits、Payment）中也包含了示例日志片段。

## 反模式（应避免）

- 在服务端随意使用 `console.log` / `console.error`，绕过统一 logger。
- 在 error 日志中记录敏感字段（如原始 access token、支付卡号等）。
- 在高频路径（如 AI 流式接口）打印大量 debug 日志，增加噪音与成本。

## Checklist

- [ ] 所有新的 API route 与 usecase 都使用统一 logger 构造与上下文注入方式。
- [ ] 关键领域（AI、Credits、Billing）的错误日志包含 ErrorCode 与 requestId。
- [ ] Job / 定时任务的日志可以通过 jobRunId 快速聚合与排查。
- [ ] 日志中不包含敏感信息，符合合规要求。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/lib/server/logger.ts`、`src/lib/server/job-logger.ts` 已提供集中化的结构化日志基础设施。
  - [x] AI / Credits 相关 usecase 与 API 路由广泛使用 `getLogger` 与 `createLoggerFromHeaders` 记录关键事件与错误。
  - [x] `distribute-credits-job` 使用 job logger 输出 jobRunId 与处理统计，便于在日志中定位一次 Job 的执行情况。
- 尚待调整 / 确认
  - [ ] 所有新加的路由 / usecase 是否均遵循相同的 logger 使用模式，而不是各自构造日志上下文。
  - [ ] 监控/告警系统中是否已经根据 ErrorCode / span / route 等字段建立了告警规则（例如 AI Provider 故障、Credits 分发失败等）。
  - [ ] 对生产环境日志进行抽样检查，确保不包含敏感数据，同时能支撑常见排查场景。

