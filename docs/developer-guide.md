# Developer Guide 开发者指南

> 面向日常开发者的简要指南，帮助你在扩展模板时快速找到“应该改哪里、要配齐哪些文档”。  
> 架构与领域背景请优先参考：`docs/architecture-overview.md`、`docs/feature-modules.md`。

---

## 1. 文档导航

- 架构与模块视图：
  - `docs/architecture-overview.md`：整体分层与核心 usecase（AI Chat、Credits Job 等）。
  - `docs/feature-modules.md`：按特性模块拆解 Auth / Payment / Credits / AI / Storage 等调用关系。
- 领域设计：
  - `docs/credits-lifecycle.md`：Credits 生命周期、边界与不变式。
  - `docs/payment-lifecycle.md`：Payment/Billing/Stripe Webhook 与 Credits 的交互与边界。
- 错误模型与日志：
  - `docs/error-codes.md`：所有对外错误码的权威表。
  - `docs/error-logging.md`：DomainError、API envelope、日志上下文、前端错误消费（hooks + registry）。
- 测试：
  - `docs/testing-strategy.md`：测试层级、现有覆盖与新增测试的推荐策略。
 - 环境与运维：
   - `docs/env-and-ops.md`：环境变量、Stripe Webhook、Cron 积分分发与日志查看等运维实践。
- 治理与协议索引：
  - `docs/governance-index.md`：汇总架构体检报告与协议/技术债报告（包括 `.codex/plan` 下的计划与报告文档），是协议层与错误码治理的入口。
  - `.codex/rules/*.md`：跨领域最佳实践与约束（错误处理、AI 质量、安全、存储等），在未被项目文档显式覆盖/否定时视为默认应遵守的约定。

---

## 2. 错误码 & 错误 UI 工作流

### 2.1 新增 / 调整错误码

1. 在代码中：
   - `src/lib/server/error-codes.ts`：为新的错误码添加常量（保持字符串值稳定、语义清晰）。
   - 如属于特定领域（Billing/Credits/Auth/Storage 等），同步更新对应类型别名（例如 `PaymentErrorCode`、`StorageErrorCode`）。
2. 在文档中：
   - `docs/error-codes.md`：在对应领域小节补充新的错误码行，说明用途与 Domain。
3. 在前端 i18n 映射中（如需展示人类可读文案）：
   - `src/lib/domain-error-utils.ts` 的 `DOMAIN_ERROR_MESSAGES`：为该 code 配置 `key`（i18n key）和可选 `fallback`。
   - 在 `messages/*.json` 中补充对应 i18n 文案。

### 2.2 新增 / 调整错误 UI 行为（toast / 跳转等）

1. 策略层（集中管理）：
   - `src/lib/domain-error-ui-registry.ts`：为错误码增加或修改 `ErrorUiStrategy`，包括：
     - `severity`: `'info' | 'warning' | 'error'`
     - `defaultFallbackMessage`: 无 i18n 时的英文兜底说明
     - `action`: `'none' | 'redirectToLogin' | 'openCreditsPage'` 等
     - `source`: `'auth' | 'credits' | 'ai' | 'payment' | 'storage' | 'generic'`
   - i18n key 始终由 `DOMAIN_ERROR_MESSAGES` 管理，registry 不负责维护 `messageKey`，只提供 fallback 与行为信息。
2. 领域 Hook（消费策略）：
   - Auth：`useAuthErrorHandler`（`src/hooks/use-auth-error-handler.ts`）
   - Credits：`useCreditsErrorUi`（`src/hooks/use-credits-error-ui.ts`）
   - AI：`useAiErrorUi`（`src/hooks/use-ai-error-ui.ts`）
   - Storage：`useStorageErrorUi`（`src/hooks/use-storage-error-ui.ts`）
   - 优先在这些 Hook 内调用 `getErrorUiStrategy` + `getDomainErrorMessage`，而不是在组件里直接写 `if (code === '...')`。
3. 组件层：
   - 组件只负责：
     - 从 Hook 得到 handler（例如 `handleCreditsError` / `handleAiError` / `handleStorageError`）；  
     - 在合适的时机调用它（如 API 失败、Action 返回失败、文件上传失败等）。
   - 不在组件中维护错误码分支逻辑，避免散落重复。

---

## 3. 新增 Feature / Usecase 的推荐路径

以“新增一个需要积分扣费的 AI 功能”为例：

1. 明确调用链与边界：
   - UI：页面 & 组件（`src/app` / `src/components`）  
   - Server Action / API Route：`src/actions/*` 或 `src/app/api/*`  
   - Usecase：`src/lib/server/usecases/*`  
   - Domain：`src/credits` / `src/domain/*` / `src/payment` 等
2. Usecase 层：
   - 在 `src/lib/server/usecases` 中新增 usecase，例如 `foo-with-credits.ts`：
     - 尽量接受简单参数，而不是 `NextRequest`/`NextResponse`。
     - 按顺序 orchestrate：鉴权上下文（由调用侧注入） → Credits 检查/扣费 → 调用下游服务 → 返回领域结果。
3. API Route / Server Action：
   - 新建或修改 `src/app/api/foo/route.ts` 或对应 `src/actions/*` 文件：
     - 统一 envelope：`{ success, error, code?, retryable? }`，错误使用 `DomainError` + `ErrorCodes`（参见 `docs/error-logging.md`）。  
     - 使用 `createLoggerFromHeaders` / `withLogContext` 绑定 `requestId`/`userId` 等上下文。
4. UI / Hooks：
   - 若存在前端调用逻辑较复杂场景，优先在 `src/hooks/*` 中封装 Hook（包括数据 fetch、错误处理、loading 状态等）。  
   - 错误处理优先通过领域 Hook（`useAuthErrorHandler` / `useCreditsErrorUi` / `useAiErrorUi` 等）。
5. 文档同步：
   - 若是核心路径（涉及 Credits / Payment / AI / Storage），建议在对应领域文档中补一小节或一行说明：  
     - Usecase 名称与入口文件；  
     - 对应 API 路由；  
     - 依赖哪些领域服务或外部 provider。

---

## 4. 日常开发检查清单

在提交 PR 或合并前，建议至少检查以下项目：

- 代码质量：
  - `pnpm lint`
  - `pnpm test`（如改动集中在某个域，可先跑对应子集测试）
- 文档同步：
  - 是否新增/修改了错误码？  
    - ✅ 更新了 `ErrorCodes` + `docs/error-codes.md` + `DOMAIN_ERROR_MESSAGES`（如涉及前端文案）。  
  - 是否新增/修改了错误 UI 行为？  
    - ✅ 更新了 `domain-error-ui-registry` + 对应领域 Hook。  
  - 是否变更了核心业务流程/边界？（如 Credits/Payment/AI）  
    - ✅ 考虑在 `docs/credits-lifecycle.md` / `docs/payment-lifecycle.md` / `docs/feature-modules.md` 增加简要说明。
- 依赖方向：
  - 是否遵守 `app → actions/api → usecases → domain/service → infra` 的依赖方向？  
  - 是否避免在 UI/Action 直接依赖 Repository 或第三方 SDK？
  - 对外部 SDK（如 Stripe、Next Request）：
    - ✅ 是否通过 Like 类型 + 适配层暴露给业务（例如 `StripeClientLike` / `StripeWebhookEventLike` / `Request` 封装），而不是在业务/测试中直接依赖大而全的 SDK 类型？
    - ✅ 测试是否只依赖这些 DTO/Like 类型构造输入，而不是到处 `as any`/`as SomeSdkType`？

这份指南不试图重复所有架构细节，而是提供一个“从哪里开始看”的入口。当你在某个领域进行较大改动时，优先结合本文件与对应领域文档进行检查即可。
