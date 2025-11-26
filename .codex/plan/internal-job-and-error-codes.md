# 中优先级改造计划：内部 Job 认证 & 错误码 Registry

## 背景与目标

- 背景：
  - 当前 API / job 入口分散实现 Basic Auth 与日志字段（jobRunId、route、span 等），内部 job API 需要统一模式。
  - 对外暴露的错误码（response.code / DomainError.code）是分散的 magic string，不利于维护和对接。
- 本轮目标（方案 2 + 增量落地）：
  1. 在 `src/lib/server` 下抽象统一的「内部 job 认证」与「job 日志」工具（A）。
  2. 建立错误码 registry，并先迁移 credits/AI 相关的核心 API 使用（C）。
  3. 保持对外 HTTP API 完全兼容（方法/路径/响应 JSON 结构和 code 字符串值不变）。

## 范围

- 包含：
  - A：内部 job API 认证与日志封装
    - 新增 `src/lib/server/internal-auth.ts`：统一 Basic Auth 解析与校验逻辑。
    - 新增 `src/lib/server/job-logger.ts`：统一 jobRunId / job 字段的日志模式。
    - 调整 `src/app/api/distribute-credits/route.ts` 与 `src/lib/server/usecases/distribute-credits-job.ts` 使用上述工具。
  - C：错误码 registry
    - 新增 `src/lib/server/error-codes.ts`：集中声明对外暴露的错误码常量。
    - 首批迁移以下 API 的 code 字段使用：
      - `src/app/api/chat/route.ts`
      - `src/app/api/analyze-content/route.ts`（至少统一 `UNEXPECTED_ERROR`）
      - `src/app/api/generate-images/route.ts`
      - `src/app/api/distribute-credits/route.ts`
- 不包含（后续可拆分为独立任务）：
  - 迁移所有其他 API / DomainError 的错误码到 registry（本轮只做 credits/AI 相关核心路径）。
  - 对 `src/credits/distribute.ts` 进行职责大规模重构（保持现状，仅配合 usecase 使用）。

## 执行步骤（A：内部 job 认证 & 日志）

### A1. 新增内部 job 认证工具 internal-auth.ts

- 位置：`src/lib/server/internal-auth.ts`
- 核心接口设计：
  - `type BasicAuthCredentials = { username: string; password: string };`
  - `type ExpectedCredentials = { username?: string; password?: string };`
  - `parseBasicAuthHeader(headers: HeaderGetter | Request): BasicAuthCredentials | null`
    - 解析 `Authorization: Basic base64(user:pass)`，失败返回 null。
  - `validateInternalJobBasicAuth(request: Request, logger: Logger, expected: ExpectedCredentials): boolean`
    - 行为保持与现有 `/api/distribute-credits` 的 `validateBasicAuth` 一致：
      - 未携带或格式错误 → 返回 false（由调用方决定返回 401）。
      - env 未配置（expected 缺少 username/password）→ `logger.error` 一条配置缺失日志，并返回 false。
      - 账号密码不匹配 → 返回 false。
- 预期结果：
  - 内部 job API 可复用 Basic Auth 逻辑；
  - 现有 `/api/distribute-credits` 行为不变，仅迁移实现位置。

### A2. 新增 job 日志工具 job-logger.ts

- 位置：`src/lib/server/job-logger.ts`
- 核心接口设计：
  - 依赖 `getLogger` 与 `LogContext`：
    - 需要在 `LogContext` 中补充可选字段：`job?: string; jobRunId?: string;`
  - `createJobLogger(params: { span: string; job: string; extra?: LogContext }): { logger: Logger; jobRunId: string }`
    - 生成 `jobRunId = \`\${job}-\${Date.now()}-\${random}\``。
    - 使用 `getLogger({ span, job, jobRunId, ...extra })` 生成 logger。
    - 返回 `{ logger, jobRunId }` 供 job usecase / route 使用。
- 预期结果：
  - job 相关日志统一包含 `span`、`job`、`jobRunId`，且创建方式一致。

### A3. 调整 distribute-credits usecase 与 route 使用新工具

- `src/lib/server/usecases/distribute-credits-job.ts`
  - 替换当前手写 `jobRunId` + `getLogger` 逻辑：
    - 引入 `createJobLogger({ span: 'usecase.credits.distribute', job: 'credits.distribute' })`。
    - 使用返回的 `logger` 与 `jobRunId` 记录「开始 / 结束」日志：
      - `logger.info({ jobRunId }, 'Starting credits distribution job');`
      - `logger.info({ jobRunId, ...result }, 'Finished credits distribution job');`
  - 保持函数签名与返回值不变。
- `src/app/api/distribute-credits/route.ts`
  - 移除本地 `validateBasicAuth` 实现。
  - 从 `serverEnv.cronJobs` 读取 expected username/password，调用：
    - `validateInternalJobBasicAuth(request, log, { username: expectedUsername, password: expectedPassword })`
  - 保持：
    - 未授权时仍由 route 记录 `log.warn('Unauthorized attempt to distribute credits')`，返回 401；
    - 成功/失败时的 JSON 结构保持不变。
- 预期结果：
  - credits 分发 job 使用统一的内部 job 认证与 job 日志模式；
  - 对外 API 行为完全兼容；
  - 现有 `/api/distribute-credits` 测试应继续通过。

## 执行步骤（C：错误码 registry）

### C1. 新增错误码 registry error-codes.ts

- 位置：`src/lib/server/error-codes.ts`
- 核心设计：
  - 使用常量对象集中声明当前关注的错误码，字符串值保持与现有实现完全一致：
    ```ts
    export const ErrorCodes = {
      UnexpectedError: 'UNEXPECTED_ERROR',
      AiChatInvalidJson: 'AI_CHAT_INVALID_JSON',
      AiChatInvalidParams: 'AI_CHAT_INVALID_PARAMS',
      CreditsDistributionFailed: 'CREDITS_DISTRIBUTION_FAILED',
      // 后续可逐步扩展，例如 analyze-content / generate-images 相关 code
    } as const;

    export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
    ```
  - 暂不强制所有 DomainError 使用此类型，仅在 API route / 部分 usecase 中优先采用。
- 预期结果：
  - 有一个集中、可被 IDE/TS 引导的错误码源，后续迁移可以渐进进行。

### C2. 迁移 chat route 使用 ErrorCodes

- 文件：`src/app/api/chat/route.ts`
- 调整内容（不改变 code 字符串值）：
  - 引入 `ErrorCodes`：
    - `import { ErrorCodes } from '@/lib/server/error-codes';`
  - 替换硬编码 `code` 字段：
    - invalid JSON：`code: ErrorCodes.AiChatInvalidJson`
    - invalid params：`code: ErrorCodes.AiChatInvalidParams`
    - unexpected error：`code: ErrorCodes.UnexpectedError`
- 预期结果：
  - 对外响应结构和 code 值不变；
  - chat route 成为 ErrorCodes 使用的参考示例。

### C3. 迁移 analyze-content / generate-images 使用 ErrorCodes（首批统一 UnexpectedError）

- 文件：
  - `src/app/api/analyze-content/route.ts`
  - `src/app/api/generate-images/route.ts`
- 调整内容：
  - 引入 `ErrorCodes`，至少在「非 DomainError/非 WebContentAnalyzerError」的 fallback 分支统一使用：
    - `code: ErrorCodes.UnexpectedError`
  - 针对 analyzer 专用错误码（来自 `WebContentAnalyzerError`），本轮保持现状：
    - 其 code 由错误类型内部维护；可在未来将这些 code 也注册到 ErrorCodes 中。
- 预期结果：
  - 所有 AI 入口的“兜底错误码”统一引用 ErrorCodes；
  - 不破坏现有 WebContentAnalyzer 的细粒度错误语义。

### C4. 迁移 distribute-credits route 使用 ErrorCodes

- 文件：`src/app/api/distribute-credits/route.ts`
- 调整内容：
  - 引入 `ErrorCodes`；
  - 错误路径使用 `code: ErrorCodes.CreditsDistributionFailed` 替代硬编码字符串。
- 预期结果：
  - credits job API 的对外 code 值仍为 `CREDITS_DISTRIBUTION_FAILED`；
  - 该 code 已在 ErrorCodes 中集中声明。

## 验证步骤

1. 运行 `pnpm lint`，确保新文件/改动符合现有风格规范（Biome）。
2. 运行 `npx tsc --noEmit`，确保：
   - 新增工具与 ErrorCodes 类型无类型错误。
   - 现有依赖（logger / usecases / routes）类型签名一致。
3. 运行 `pnpm test`，重点关注：
   - `src/app/api/__tests__/distribute-credits-route.test.ts`
   - `src/app/api/__tests__/chat-route.test.ts`
   - `src/app/api/__tests__/analyze-content-route.test.ts`
   - `src/app/api/__tests__/generate-images-route.test.ts`

## 备注

- 本轮改动遵循：
  - KISS：抽象只覆盖当前必要的 job / error code 场景；
  - YAGNI：暂不一次性迁移所有错误码，仅为后续迭代预留清晰路径；
  - DRY：消除重复的 Basic Auth 和 jobRunId 日志实现；
  - SOLID：认证与日志抽象为可复用服务，API route 和 usecase 各自关注自身职责。

