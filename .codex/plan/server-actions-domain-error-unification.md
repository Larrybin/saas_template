# Server Actions 域错误统一改造计划（Billing/Credits + Newsletter）

## 上下文

- 规则基线：`.codex/rules/error-handling-and-fallbacks-best-practices.md` 要求端到端错误链路：
  - DomainError / ErrorCodes → JSON envelope → 日志 → i18n key → UI 组件。
- 基础设施现状：
  - `src/lib/domain-errors.ts` 定义 `DomainError`，`src/lib/server/error-codes.ts` 统一管理 ErrorCodes。
  - `src/lib/safe-action.ts` 的 `actionClient` 在 `handleServerError` 中已经识别 `DomainError` 并返回 `{ success: false, error, code, retryable }`。
  - 前端通过 `unwrapEnvelopeOrThrowDomainError` 消费 Envelope。
- 问题现状：
  - 多个 Server Action（尤其是 Billing/Credits + Newsletter + Contact/Captcha）在失败时直接 `return { success: false, error }`，未附带 `code` / `retryable`，也未保持 DomainError 链路。
  - 部分下游 Domain 层已经抛出 `DomainError`，但在 Action 内被 `catch` 后转为裸字符串错误，导致错误链路中断。

## 改造目标

1. 针对 Billing/Credits + Newsletter + Contact/Captcha 相关 Server Actions：
   - 统一通过 `DomainError` + `ErrorCodes` 表达错误；
   - 任何错误最终经由 `safe-action` 返回 `{ success: false, error, code, retryable }` Envelope；
   - 删除/改写当前仅返回 `{ success: false, error }` 的分支。
2. 新增 Newsletter/Contact/Captcha 相关错误码，并同步更新 `docs/error-codes.md`。
3. 与 `docs/api-reference.md` 的 Server Actions 说明保持一致，示例中体现 `code` / `retryable` 形态。

## 改造范围

- ErrorCodes 与文档：
  - `src/lib/server/error-codes.ts`
  - `docs/error-codes.md`
- Billing / Credits 相关 Actions：
  - `src/actions/create-checkout-session.ts`
  - `src/actions/create-credit-checkout-session.ts`
  - `src/actions/create-customer-portal-session.ts`
  - `src/actions/get-credit-balance.ts`
  - `src/actions/get-credit-stats.ts`
  - `src/actions/get-credit-transactions.ts`
  - `src/actions/get-lifetime-status.ts`
  - `src/actions/consume-credits.ts`（已透传 DomainError，仅校验是否需要轻微调整）
- Newsletter / Contact / Captcha：
  - `src/actions/subscribe-newsletter.ts`
  - `src/actions/unsubscribe-newsletter.ts`
  - `src/actions/check-newsletter-status.ts`
  - `src/actions/send-message.ts`
  - `src/actions/validate-captcha.ts`
- 配套前端（只做验证，不做大改）：
  - `src/hooks/use-credits.ts`
  - `src/hooks/use-newsletter.ts`
  - `src/components/auth/register-form.tsx`
  - `src/components/auth/login-form.tsx`

## 实施步骤

1. **错误码与文档同步**
   - 在 `src/lib/server/error-codes.ts` 中新增：
     - `NewsletterSubscribeFailed`, `NewsletterUnsubscribeFailed`, `NewsletterStatusFailed`
     - `ContactSendFailed`, `CaptchaValidationFailed`
   - 在 `docs/error-codes.md` 中补充上述错误码的表格条目，归类到合适的 Domain（Newsletter / Contact / Auth/Generic）。
2. **Newsletter Actions 改造**
   - `subscribe-newsletter.ts`：
     - 将 `!subscribed` 分支改为 `throw new DomainError({ code: ErrorCodes.NewsletterSubscribeFailed, message, retryable: true })`。
     - 在 `catch` 中保留日志，若 `error` 为 `DomainError` 则直接 `throw`，否则包装为 `DomainError(NewsletterSubscribeFailed)` 并抛出。
   - `unsubscribe-newsletter.ts`：
     - `!unsubscribed` 分支使用 `NewsletterUnsubscribeFailed`。
     - `catch` 中使用同样的 `DomainError` 包装逻辑。
   - `check-newsletter-status.ts`：
     - 正常路径维持 `{ success: true, subscribed }`。
     - `catch` 中使用 `NewsletterStatusFailed` 包装为 `DomainError` 并抛出。
3. **Billing / Credits Actions 改造**
   - `create-checkout-session.ts`：
     - 删除手动 `findPlanByPlanId` 校验，依赖 `DefaultBillingService.ensurePlanAndPrice` 抛出的 `DomainError(BillingPlanNotFound/BillingPriceNotFound)`。
     - 在 `catch` 中：
       - 保留带上下文的 `logger.error`；
       - 若 `error` 是 `DomainError` 则直接 `throw`；
       - 否则抛出 `DomainError({ code: ErrorCodes.UnexpectedError, message: 'Failed to create checkout session', retryable: true })`。
   - `create-credit-checkout-session.ts`：
     - `!creditPackage` 分支改为抛出 `DomainError({ code: ErrorCodes.CreditsInvalidPayload, ... })`；
     - 为调用 `createCreditCheckout` 增加 `try/catch`，使用与上类似的 `DomainError`/`UnexpectedError` 模式。
   - `create-customer-portal-session.ts`：
     - `!customer` / `!customer.customerId` 分支改为抛 `DomainError`，当前可使用 `UnexpectedError`，`retryable: false`；
     - `catch` 中对非 `DomainError` 的异常统一包装为 `UnexpectedError`，`retryable: true`。
   - `get-credit-balance.ts` / `get-credit-stats.ts` / `get-credit-transactions.ts` / `get-lifetime-status.ts` / `get-users.ts`：
     - 保留现有查询与日志；
     - 在 `catch` 中：
       - `error instanceof DomainError` → 直接 `throw`；
       - 否��抛出 `DomainError({ code: ErrorCodes.UnexpectedError, message: 'Failed to ...', retryable: true })`。
   - `consume-credits.ts`：
     - 保持透传 `consumeCredits` 抛出的 `DomainError`，仅在需要时为非 `DomainError` 的异常增加 `try/catch` 包装。
4. **Contact/Captcha Actions 改造**
   - `send-message.ts`：
     - `!result` 分支改为抛 `DomainError({ code: ErrorCodes.ContactSendFailed, message: 'Failed to send the message', retryable: true })`。
     - `catch` 中对 `DomainError` 直接透传，对其它异常包装为 `ContactSendFailed` 并抛出。
   - `validate-captcha.ts`：
     - 保持 `success: true, valid: isValid` 语义（用户输入错误时不走 DomainError，而是 `valid: false`）。
     - 仅在调用 Turnstile 抛异常时，在 `catch` 中抛 `DomainError({ code: ErrorCodes.CaptchaValidationFailed, message, retryable: true })`。
5. **API 文档更新**
   - 在 `docs/api-reference.md` 中：
     - 更新 Server Actions 失败示例，展示带 `code` / `retryable` 的 Envelope。
     - 在 `createCheckoutAction` 等说明中，补充“错误通过 DomainError + ErrorCodes 返回”的描述。
6. **验证与回归检查**
   - 静态检查：确保所有修改后的 Actions 返回类型仍满足 `EnvelopeWithDomainError` 约定。
   - 前端调用检查：
     - `use-credits.ts` / `use-newsletter.ts` 的 `unwrapEnvelopeOrThrowDomainError` 调用保持不变，仅确认默认错误文案与新增错误码语义一致。
     - `register-form.tsx` / `login-form.tsx` 中对 `validateCaptchaAction` 返回值的使用不受破坏。
   - 建议在本地运行 `pnpm lint` 与相关测试（如存在）验证回归。

## 备注

- 本计划仅覆盖 Billing/Credits + Newsletter + Contact/Captcha 域的 Server Actions。其它模块（如 Storage、Docs Search 等）保留在后续批次中统一治理。
- 若后续需要针对 Newsletter/Contact/Captcha 的错误做 UI 级别本地化，可在 `DOMAIN_ERROR_MESSAGES` 中为新错误码补充 i18n key 映射。

### 当前进展（2025-12）

- 已在 `src/lib/safe-action.ts` 中引入统一的 Action 错误包装 helper：`withActionErrorBoundary(options, handler)`，负责：
  - 记录 `logger.error` 日志（使用调用侧传入的 span 与上下文）；
  - 对 `DomainError` 直接透传；
  - 对其它异常统一包装为 `DomainError`（默认 `ErrorCodes.UnexpectedError` + `retryable: true`，或由调用侧覆盖）。
- 首批完成迁移的 Actions（行为保持兼容，仅收敛样板代码）：
  - Credits：`get-credit-balance.ts`、`get-credit-overview.ts`、`get-credit-stats.ts`、`get-credit-transactions.ts`、`consume-credits.ts`；
  - Billing/Payment：`create-checkout-session.ts`、`get-active-subscription.ts`；
  - Newsletter：`check-newsletter-status.ts`、`subscribe-newsletter.ts`、`unsubscribe-newsletter.ts`；
  - Contact/Captcha：`send-message.ts`、`validate-captcha.ts`。
- 后续批次将按同一模式向其它 Billing/Credits + Newsletter + Contact/Captcha Actions 推进迁移，直至本计划覆盖范围内的 Actions 全部收敛到 `withActionErrorBoundary`。

---

## 7. 与规则文档对齐情况（2025-12 二期规划）

本计划需要持续与 `.codex/rules/*` 与 `docs/*` 中的约束保持一致，当前对齐情况如下，并在本节中记录后续迭代方向。

### 7.1 规则对齐现状

- 错误链路与协议：
  - 与 `.codex/rules/error-handling-and-fallbacks-best-practices.md` 对齐：当前改造方向均采用 `DomainError` + `ErrorCodes` + safe-action envelope 的链路，避免在 Action 层吞掉下游 DomainError 信息。
  - 与 `.codex/rules/api-protocol-and-error-codes-best-practices.md` 对齐：API routes 与 Actions 使用统一 `{ success, data }` / `{ success: false, error, code, retryable }` Envelope；新增/调整的错误码已同步到 `docs/error-codes.md`。
- 日志与可观测性：
  - 与 `.codex/rules/logging-and-observability-best-practices.md` / `docs/error-logging.md` 对齐：所有涉及本计划的 Actions 与 routes 均通过 `getLogger` / `createLoggerFromHeaders` 输出结构化日志，并附带 `span` / `userId` / `route` 等上下文。
- 测试策略：
  - 与 `.codex/rules/testing-strategy-best-practices.md` / `docs/testing-strategy.md` 对齐：`tests/actions/*-domain-error.test.ts` 采用官方推荐模式，通过统一 helpers mock safe-action，专注验证 DomainError 行为。

目前未发现违反上述规则的实现，但存在可以进一步收敛的“最佳实践优化点”，在 7.2/7.3 中记录为后续演进目标。

### 7.2 实现约束（Error Boundary 规范）

为保证后续新增/修改的 Server Actions 与规则文档长期一致，补充以下实现约束（在本计划后续批次中逐步达成）：

1. **所有 Server Actions 必须经过 Error Boundary 包裹**
   - 约定：`actionClient` / `userActionClient` / `adminActionClient` 的 `.action(...)` 调用，其实现均通过：
     - `actionClient.action(withActionErrorBoundary(options, handler))`
     - 或 `actionClient.schema(schema).action(withActionErrorBoundary(options, handler))`
   - 不再允许在 Action 内手写“兜底型 try/catch + logger.error + DomainError 包装”模板代码，减少重复与偏差。

2. **业务级 DomainError 仅在 handler 内部抛出**
   - handler 可以根据业务条件抛出带 `code` / `retryable` 的 `DomainError`（如 `CreditsInvalidPayload` / `NewsletterSubscribeFailed` 等），作为正常控制流的一部分。
   - 兜底的“非 DomainError → DomainError 包装”逻辑统一交由 `withActionErrorBoundary` 处理，避免在多个 Action 内重复编写。

3. **日志尽量只打一次（必要时分层）**
   - 默认由 `withActionErrorBoundary` 负责在错误路径记录 `logger.error({ error, ...context }, logMessage)`。
   - handler 内仅在需要额外业务语义时记录 `info`/`warn`（例如“user 未订阅但访问某功能”），避免对同一异常重复记录两次 `error` 等级日志。

4. **轻量结构整理：统一 ctx 访问**
   - 在后续执行阶段，引入小工具函数（示例）：
     - `getUserFromCtx(ctx): User`
   - 目标：减少 `(ctx as { user: User }).user` 这类断言在各个 Actions 中散落，便于统一维护与类型收紧。

> 注：本节仅定义约束与目标，不强制要求一次性完成；实际落地节奏由后续执行批次控制。

### 7.3 工具与脚本支撑（check-protocol-and-errors 增强）

为将上述约束转化为可执行的“守门人”，在后续执行阶段对 `scripts/check-protocol-and-errors.ts` 做以下增量改造：

1. **保留现有检查**
   - 已有检查保持不变：
     - API routes 使用 `NextResponse.json` 时必须带 `success` 字段；
     - `src/actions` 下的文件必须 import `@/lib/safe-action`（`schemas.ts` 例外）；
     - `ErrorCodes` 与 `docs/error-codes.md` / `domain-error-ui-registry` 保持一致；
     - `DomainError` 子类引用的 `ErrorCodes.X` 必须存在。

2. **新增检查：Actions 必须通过 Error Boundary**
   - 在 `actionsDir = src/actions` 范围内，扫描所有 `.action(` 调用：
     - 若 `.action(` 的第一个参数不是 `withActionErrorBoundary(` 调用（考虑多行书写场景），则记录一条 `warn` 级别 violation，提示该 Action 尚未通过统一 Error Boundary 封装。
   - 初期将此检查标记为 `warn`，在完成大部分迁移后，再视情况升级为 `error`，纳入 CI 强制约束。

3. **CI 集成计划**
   - `package.json` 中已添加 `check:protocol` 命令；后续在 CI pipeline 中保证 `pnpm check:protocol` 与 `pnpm lint` / `pnpm test` 一同执行。
   - 当“Actions 全部迁移到 Error Boundary”达成稳定状态后，可以在本计划与 `docs/developer-guide.md` 中公告：未通过 Error Boundary 的 Actions 会导致 CI 失败。

### 7.4 测试与 helpers 的后续优化

结合 `docs/testing-strategy.md` 的推荐模式，对测试与 helpers 规划以下优化：

1. **对齐测试版 Error Boundary 与生产实现**
   - 当前 `tests/helpers/actions.ts` 内定义了测试版 `withActionErrorBoundary`，行为需要与 `src/lib/safe-action.ts` 保持同步。
   - 后续执行阶段优先考虑策略：
     - 直接从 `@/lib/safe-action` 导入真实 `withActionErrorBoundary`，只通过 `vi.mock('@/lib/server/logger')` 控制日志输出；
     - 若出于隔离原因需要继续使用测试版实现，则需在文件头明确标注“与生产实现保持严格同步”的约定，并在每次修改 `src/lib/safe-action.ts` 时同步审核该 helper。

2. **DomainError 行为测试覆盖**
   - 对本计划覆盖的每个关键 Action（Billing/Credits + Newsletter + Contact/Captcha），均补充或完善对应的 `tests/actions/*-domain-error.test.ts`：
     - 验证成功路径（`success: true`）；
     - 验证 `DomainError` 直接透传（不被二次包装，`code` / `retryable` 保持不变）；
     - 验证非 `DomainError` 异常被包装为预期的 `ErrorCodes.*` + `retryable`。

### 7.5 后续待办清单（Actions 域二期）

为方便跟踪，本节按照“任务 + 状态”的方式持续更新（最近一次更新：2025-12-05）。

1. **盘点与标记 Actions 迁移状态**（✅ 已完成）
   - 结果如下（不含 `schemas.ts`，所有条目均直接调用 `*.action(...)`）：
     - **A 类（16 个，已全部通过 Error Boundary，且无额外兜底）**  
       `check-newsletter-status.ts`、`consume-credits.ts`、`create-checkout-session.ts`、`create-credit-checkout-session.ts`、`create-customer-portal-session.ts`、`get-active-subscription.ts`、`get-credit-balance.ts`、`get-credit-overview.ts`、`get-credit-stats.ts`、`get-credit-transactions.ts`、`get-lifetime-status.ts`、`get-users.ts`、`send-message.ts`、`subscribe-newsletter.ts`、`unsubscribe-newsletter.ts`、`validate-captcha.ts`
     - **B 类（0 个）**：无残留重复兜底逻辑。
     - **C 类（0 个）**：所有 Server Actions 均已接入 `withActionErrorBoundary`。

2. **逐步迁移 B/C 类 Actions**（✅ 已完成）
   - 上述 16 个 Actions 均已完成迁移与兜底清理；后续新增 Actions 必须直接以 `actionClient.schema(...).action(withActionErrorBoundary(...))` 形态落地。

3. **日志与隐私的精细化审查**（✅ 已完成）
   - 2025-12-05：完成首轮 Server Actions 检查；新增 `emailHashForLog` 并收敛 Actions 层 email 日志。
   - 2025-12-06：引入 `createEmailLogFields`（Mail + Newsletter）和 `sanitizeImageResultForLog`（AI usecase），所有邮箱日志仅保留 hash/domain，图片生成错误日志只记录结构摘要，避免 base64/prompt 泄露。

4. **脚本与 CI 升级**（✅ 已完成）
   - `scripts/check-protocol-and-errors.ts` 中的 “Action 未接入 Error Boundary” 检查已从 `warn` 升级为 `error`，同时 `docs/developer-guide.md` 记录了该强制要求；`pnpm check:protocol` 失败将阻止 CI 通过。
