# Plan: testing-coverage-and-testability-upgrade

## 背景与目标

- 聚焦四类测试与可测性缺口：
  - 协议敏感但非核心的 API Routes（例如 `/api/storage/upload`）缺少独立 route 测试，错误分支与统一 JSON envelope 未被系统验证。
  - 关键 Server Actions（例如 `subscribe-newsletter`、`consume-credits`）仅有 schema/间接测试，缺少行为级测试（成功/失败分支与 safe-action envelope 行为）。
  - 复杂导航/设置页面（如 navbar、`settings/credits`）在路由/登录状态/tab 行为上风险较高，组件级测试缺失。
  - E2E 覆盖集中在认证，尚未覆盖 Credits 购买/消耗、订阅、AI Chat/Analyze/Image 等业务闭环。
- 约束与原则：
  - 遵循 `.codex/rules/api-protocol-and-error-codes-best-practices.md`、`.codex/plan/unify-api-envelope-and-errors.md`、`docs/testing-strategy.md` 与 `docs/error-logging.md`。
  - 测试适应代码，不为测试强推过度重构；仅在必要时进行轻量可测性抽取。
  - 优先使用 Vitest（Node 环境）与 Playwright，不在本轮引入新的前端测试栈（如 RTL/jsdom）。

## 范围与输出

- API Routes：
  - 为 `/api/storage/upload` 等协议敏感路由补充 route 行为与 envelope 测试。
  - 确保关键错误码与 HTTP 状态（400/500）在测试中被覆盖。
- Server Actions：
  - 为 `subscribeNewsletterAction`、`consumeCreditsAction` 增加行为级测试：
    - 覆盖成功、领域错误（DomainError）、未预期错误三种分支。
    - 验证 safe-action 的 envelope 行为与 `ErrorCodes` 一致。
- E2E：
  - 在 `tests/e2e` 中扩展 Credits/AI 相关闭环：
    - 验证登录态下 navbar 与 `settings/credits` 的导航。
    - 验证 AI Chat/Analyze 的基础 happy-path 渲染。
- 文档与约定：
  - 在本计划文件中记录测试模式，作为后续新增 route/action/闭环测试的参考。

## 执行步骤（与实际提交对应）

1. API Routes：storage 上传 route 测试
   - 新增 `src/app/api/__tests__/storage-upload-route.test.ts`：
     - Mock：
       - `ensureApiUser`：默认返回已登录用户 `user_1`。
       - `enforceRateLimit`：默认允许请求通过。
       - `uploadFile`：默认返回固定的 `url`/`path`，并在断言中验证调用参数。
     - 使用 `FormData`/`File` 构造 multipart 请求，不引入额外测试工具。
     - 覆盖场景：
       - 非 multipart content-type → 400 + `StorageInvalidContentType`。
       - 缺少 file → 400 + `StorageNoFile`。
       - 超过 10MB → 400 + `StorageFileTooLarge`。
       - 不支持 mime → 400 + `StorageUnsupportedType`。
       - 非法 folder（路径不在允许 root 或包含非法字符）→ 400 + `StorageInvalidFolder`。
       - 正常上传 → 200 + `{ success: true, data }`，断言 `uploadFile` 调用参数（包括 folder 归一化逻辑）。
       - `uploadFile` 抛 `StorageError` → 500 + `StorageProviderError` + `retryable: true`。
       - 其它异常 → 500 + `StorageUnknownError` + `retryable: true`。

2. Server Actions：行为级测试模式与实现
   - 统一模式：
     - 直接调用 safe-action 导出的 action 函数，并通过 Vitest mock 对外部依赖（newsletter/storage/credits/logger 等）进行控制。
     - 行为级测试只断言对外可观察结果（`success`/`error.code`/`retryable` 和必要的依赖调用），不依赖 `DomainError` 内部实现细节。
   - `subscribeNewsletterAction`：
     - 新增 `tests/actions/subscribe-newsletter-action.test.ts`：
       - Mock：
         - `subscribe`：控制返回 `true`/`false` 或抛出错误。
         - `sendEmail`：成功执行或抛错。
         - `getLocale`：返回固定 locale（例如 `'en'`）。
         - `getLogger`：提供哑实现，避免日志对测试产生噪音。
       - 覆盖场景：
         - `subscribe` 返回 `true` 且 `sendEmail` 成功 → `{ success: true }`。
         - `subscribe` 返回 `false` → safe-action 封装为 `{ success: false, error.code = NewsletterSubscribeFailed, retryable: true }`。
         - `subscribe` 抛 `DomainError` → 最终 envelope 中 `code`/`retryable` 与 DomainError 一致。
         - `subscribe` 抛普通 `Error` → 包装为 `DomainError(NewsletterSubscribeFailed)`，最终 envelope 中 `code = NewsletterSubscribeFailed`。
   - `consumeCreditsAction`：
     - 新增 `tests/actions/consume-credits-action.test.ts`：
       - Mock：
         - `consumeCredits`：控制成功 / 抛 `DomainError` / 抛普通 `Error`。
         - `getLogger`：同样提供哑实现。
         - 通过局部 mock `userActionClient.schema().action()` 的包装行为，使测试可以调用内部实现以断言 DomainError 传播。
       - 覆盖场景：
         - 正常扣费 → 返回 `{ success: true }`，并断言 `consumeCredits` 调用参数（userId/amount/description）。
         - `consumeCredits` 抛 `DomainError`（例如 `CREDITS_INSUFFICIENT_BALANCE`）→ 内部实现保持抛出 DomainError，由 safe-action 统一封装；测试通过断言抛出的错误类型和 code 确认。
         - `consumeCredits` 抛普通 `Error` → 被包装为 `DomainError(UnexpectedError)`，测试中断言 `code = UnexpectedError`。

3. E2E：Credits + AI 闭环与导航
   - 新增 `tests/e2e/credits-and-ai-flows.spec.ts`：
     - 遵循 `auth.spec.ts` 的开关约定：仅在 `PLAYWRIGHT_ENABLE === 'true'` 时运行。
     - 通过在浏览器上下文中写入 `__Secure-better-auth.session_token` 模拟已登录用户。
     - 覆盖场景：
       - navbar 在登录态下展示与 Credits 相关的入口：
         - 从 `Routes.Dashboard` 进入，断言页面上存在名称包含“credits/积分”的链接。
       - 能够导航到 `settings/credits` 页面：
         - 直接访问 `Routes.SettingsCredits`，断言页面标题中包含“Credits/积分”，验证路由 + 页面结构。
       - AI Chat happy-path 渲染：
         - 访问 `Routes.AIChat`。
         - 找到聊天输入框（通过 placeholder/role），输入消息并回车。
         - 断言包含请求文本或响应的消息区域可见。
       - AI Analyze 页面基本渲染：
         - 访问 `Routes.AIText`。
         - 在 URL 输入框中填入 `https://example.com`。
         - 点击包含“Analyze/分析”文案的按钮。
         - 断言结果区域（包含 “analysis/结果/summary/摘要” 文案）可见。
   - 说明：
     - E2E 仅覆盖少量高价值 happy-path 场景，与 `docs/testing-strategy.md` 的测试金字塔策略保持一致。

## 验证与后续建议

- 验证步骤：
  - 使用 `pnpm test` 运行 Vitest，确保新增 route/actions 测试稳定通过。
  - 按需设置 `PLAYWRIGHT_ENABLE=true` 并运行 `pnpm test:e2e`，确保新增 E2E 用例在可用环境下通过。
- 覆盖效果（预期）：
  - `src/app/api/storage/upload/route.ts` 的主干分支（成功 + 所有 envelope 错误分支）被行为级测试覆盖。
  - `subscribeNewsletterAction` / `consumeCreditsAction` 的成功/领域错误/未预期错误路径均在行为级测试中得到验证，safe-action envelope 行为受到保护。
  - Navbar 与 `settings/credits` 在登录态下的导航，以及 AI Chat/Analyze 的基础用户路径有 E2E 验证，为后续重构提供安全网。
- 后续可能的增强（不在本轮范围内）：
  - 若 UI 层重构频率继续升高，可考虑在单独的 Vitest 配置中引入 `jsdom + @testing-library/react`，为 navbar 和 settings/credits 页面增加少量组件级测试。
  - 对其它尚未覆盖的协议敏感 route/Server Actions，按本计划中的模式逐步扩展测试，保持与 `.codex/rules/testing-strategy-best-practices.md` 一致。

## DomainError 行为测试索引（按领域分组）

> 说明：本小节汇总所有围绕 `DomainError` 的行为级测试，按领域分组，便于后续扩展或回归检查。所有 Action 测试均通过 `vi.mock('@/lib/safe-action')` 暴露内部实现，仅验证业务逻辑抛出的 `DomainError`（`code` / `retryable`），safe-action 的 envelope 行为由 `src/lib/__tests__/safe-action.test.ts` 统一覆盖。

### 1. safe-action 映射层

- 全局错误映射：
  - `src/lib/__tests__/safe-action.test.ts`
    - 覆盖：
      - `DomainError` → `{ success: false, error, code, retryable }`
      - 普通 `Error` → `{ success: false, error }`
      - 非 `Error` 值 → `{ success: false, error: 'Something went wrong while executing the action' }`

### 2. Newsletter / Contact 域

- 订阅 / 退订 / 状态查询：
  - `tests/actions/subscribe-newsletter-domain-error.test.ts`
    - 测试 `subscribeNewsletterAction`：
      - `subscribe` 成功 + `sendEmail` 成功 → `{ success: true }`
      - `subscribe` 返回 `false` → 抛 `DomainError(NewsletterSubscribeFailed, retryable: true)`
      - `subscribe` 抛 `DomainError` → 原样抛出
      - `subscribe` 抛普通 `Error` → 包装为 `DomainError(NewsletterSubscribeFailed)`
  - `tests/actions/unsubscribe-newsletter-domain-error.test.ts`
    - 测试 `unsubscribeNewsletterAction`：
      - `unsubscribe` 返回 `true` → `{ success: true }`
      - `unsubscribe` 返回 `false` → 抛 `DomainError(NewsletterUnsubscribeFailed)`
      - `unsubscribe` 抛 `DomainError` → 原样抛出
      - `unsubscribe` 抛普通 `Error` → 包装为 `DomainError(NewsletterUnsubscribeFailed)`
  - `tests/actions/check-newsletter-status-domain-error.test.ts`
    - 测试 `checkNewsletterStatusAction`：
      - `isSubscribed` 成功 → `{ success: true, subscribed }`
      - `isSubscribed` 抛 `DomainError(NewsletterStatusFailed)` → 原样抛出
      - `isSubscribed` 抛普通 `Error` → 包装为 `DomainError(NewsletterStatusFailed)`

- 联系表单：
  - `tests/actions/send-message-domain-error.test.ts`
    - 测试 `sendMessageAction`：
      - `sendEmail` 返回 truthy → `{ success: true }`
      - `sendEmail` 返回 falsy → 抛 `DomainError(ContactSendFailed)`
      - `sendEmail` 抛 `DomainError` → 原样抛出
      - `sendEmail` 抛普通 `Error` → 包装为 `DomainError(ContactSendFailed)`

### 3. Captcha / Auth 边缘

- `tests/actions/validate-captcha-domain-error.test.ts`
  - 测试 `validateCaptchaAction`：
    - `validateTurnstileToken` 成功 → `{ success: true, valid }`
    - `validateTurnstileToken` 抛 `DomainError(CaptchaValidationFailed)` → 原样抛出
    - `validateTurnstileToken` 抛普通 `Error` → 包装为 `DomainError(CaptchaValidationFailed)`

### 4. Credits 域（余额 / 交易 / 统计）

- 交易列表：
  - `tests/actions/get-credit-transactions-domain-error.test.ts`
    - 测试 `getCreditTransactionsAction`：
      - `getDb` 抛 `DomainError` → 原样抛出
      - `getDb` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

- 统计数据：
  - `tests/actions/get-credit-stats-domain-error.test.ts`
    - 测试 `getCreditStatsAction`：
      - `getDb` 抛 `DomainError(UNEXPECTED_ERROR)` → 原样抛出
      - `getDb` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

- 余额查询：
  - `tests/actions/get-credit-balance-domain-error.test.ts`
    - 测试 `getCreditBalanceAction`：
      - `getUserCredits` 成功 → `{ success: true, credits }`
      - `getUserCredits` 抛 `DomainError(UNEXPECTED_ERROR)` → 原样抛出
      - `getUserCredits` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

- Credits 消费：
  - `tests/actions/consume-credits-domain-error.test.ts`
    - 测试 `consumeCreditsAction`：
      - `consumeCredits` 成功 → `{ success: true }`，并断言调用参数
      - `consumeCredits` 抛 `DomainError(CreditsInsufficientBalance)` → 原样抛出
      - `consumeCredits` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

### 5. Billing / Payment / Subscription 域

- 订阅状态：
  - `tests/actions/get-active-subscription-domain-error.test.ts`
    - 测试 `getActiveSubscriptionAction`：
      - Stripe env 未配置 → `{ success: true, data: null }`
      - `getSubscriptions` 抛 `DomainError(SubscriptionFetchFailed)` → 原样抛出
      - `getSubscriptions` 抛普通 `Error` → 包装为 `DomainError(SubscriptionFetchFailed)`

- 订阅 checkout：
  - `tests/actions/create-checkout-domain-error.test.ts`
    - 测试 `createCheckoutAction`：
      - `getLocale` 抛 `DomainError` → 原样抛出（模拟依赖内部 DomainError）
      - `getLocale` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

- Credits checkout：
  - `tests/actions/create-credit-checkout-domain-error.test.ts`
    - 测试 `createCreditCheckoutSession`：
      - `getCreditPackageById` 返回 `undefined` → 抛 `DomainError(CreditsInvalidPayload, retryable: false)`
      - `getCreditPackageById` 返回有效 package 且 `createCreditCheckout` 抛 `DomainError` → 原样抛出
      - 同前但 `createCreditCheckout` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

- Customer portal：
  - `tests/actions/create-customer-portal-domain-error.test.ts`
    - 测试 `createPortalAction`：
      - `getDb` 抛 `DomainError(UNEXPECTED_ERROR)` → 原样抛出
      - `getDb` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

- Lifetime 会员状态：
  - `tests/actions/get-lifetime-status-domain-error.test.ts`
    - 测试 `getLifetimeStatusAction`：
      - `getAllPricePlans` 返回空 → 抛 `DomainError(UNEXPECTED_ERROR, retryable: false)`（“系统无 lifetime 计划”）
      - 存在 lifetime 计划 + `getDb` 抛 `DomainError` → 原样抛出
      - 同前但 `getDb` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`

### 6. 管理后台 / 用户列表

- `tests/actions/get-users-domain-error.test.ts`
  - 测试 `getUsersAction`：
    - `getDb` 抛 `DomainError` → 原样抛出
    - `getDb` 抛普通 `Error` → 包装为 `DomainError(UNEXPECTED_ERROR)`
