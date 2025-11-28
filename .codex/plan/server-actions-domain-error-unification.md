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

