# Testing Strategy 测试策略说明

> 本文描述本项目使用的测试层级、已有测试覆盖，以及在扩展功能时如何对齐现有测试风格。  
> Vitest 配置见 `vitest.config.ts`，E2E 配置见 `playwright.config.ts`。

---

## 1. 测试总览

- 测试框架：
  - 单元 / 集成测试：Vitest（`vitest.config.ts`，环境：`node`，全局注入 + `vitest.setup.ts`）。
  - 端到端测试（E2E）：Playwright（`tests/e2e/*.spec.ts`）。
- 测试文件约定：
  - Vitest：
    - `tests/**/*.test.ts`：顶层或跨模块测试（如 actions / env / proxy 等）。  
    - `src/**/*.{test,spec}.{ts,tsx}`：紧邻实现文件的单元/集成测试（如 credits/domain/usecases/api/hooks 等）。
  - Playwright：
    - `tests/e2e/*.spec.ts`：模拟真实浏览器行为，覆盖登录等关键用户流程。
- 常用命令：
  - `pnpm test`：运行所有 Vitest 测试。  
  - `pnpm test:coverage`：生成覆盖率报告。  
  - `pnpm test:e2e`：运行 Playwright E2E 测试。  
  - `pnpm lint`：Biome 格式与静态检查。

---

## 2. 现有测试分层与覆盖

### 2.1 跨模块 / 顶层测试（`tests/`）

- `tests/proxy-helpers.test.ts`：  
  - 覆盖 `src/proxy/helpers.ts` 等代理工具，确保与 Better Auth / API 的集成行为符合预期。
- `tests/actions/*`：  
  - 如 `tests/actions/get-active-subscription.test.ts`、`tests/actions/validate-captcha.test.ts`。  
  - 用于验证 Server Actions 的 envelope、鉴权与核心业务分支。
- `tests/env/*`：  
  - 如 `tests/env/client-env.test.ts`。  
  - 校验 `env` 模块对环境变量的解析、默认值与错误抛出行为。
- `tests/e2e/*`：  
  - 如 `tests/e2e/auth.spec.ts`。  
  - 通过浏览器模拟测试登录/注销等端到端流程。

### 2.2 领域与服务层（`src/**/__tests__`）

- Credits 模块：
  - `src/credits/domain/__tests__/*`：  
    - `credit-ledger-domain-service.test.ts`、`plan-credits-policy.test.ts` 等，验证积分账本领域规则与策略。  
  - `src/credits/services/__tests__/*`：  
    - `credit-ledger-service.test.ts`、`*-errors.test.ts`、`*-plan-policy.test.ts` 等，验证网关/服务层与 Repository 交互行为。  
  - `src/credits/distribution/__tests__/credit-distribution-service.test.ts`：  
    - 覆盖积分分发服务逻辑。  
  - `src/credits/expiry-job.test.ts`、`src/credits/__tests__/distribute-lifetime-membership.test.ts`：  
    - 覆盖 Job 与终身会员积分发放行为。

- Billing 模块：
  - `src/domain/billing/__tests__/billing-service.test.ts`：  
    - 单元测试 Billing 域服务在不同配置/用户场景下的行为（订阅、lifetime 等）。  
  - `src/domain/billing/__tests__/billing-to-credits.integration.test.ts`：  
    - 验证 Billing 与 Credits 之间的积分发放联动（集成视角）。

- Usecase 层（AI + Credits）：
  - `src/lib/server/usecases/__tests__/*`：  
    - `execute-ai-chat-with-billing.test.ts`：验证 Chat + 积分扣费用例的行为。  
    - `analyze-web-content-with-credits.test.ts`：验证文本分析 + 积分扣费用例。  
    - `generate-image-with-credits.test.ts`：验证图片生成 + 积分扣费用例。

- Payment 模块：
  - `src/payment/services/__tests__/stripe-payment-service.test.ts`：  
    - 覆盖 `StripePaymentAdapter` 主要行为（checkout / webhook / subscriptions 等），确保与仓储/通知/Credits/Billing 的协作正常。
  - `src/payment/services/__tests__/webhook-handler-credit.test.ts`：  
    - 基于 `tests/helpers/payment.ts` 的 InMemory repository/Fake gateway，验证 credit purchase webhook 在事务上下文中如何写入 `PaymentRepository`、调用 `CreditsGateway`，并覆盖 package 缺失、重复 session、网关异常等失败分支。

- Mail 模块：
  - `src/mail/__tests__/mail-service.test.ts`：  
    - 验证 Resend provider 初始化缓存、`sendEmail` 在 template/raw 路径上的委托，并通过 `tests/helpers/mail.ts` 的 fake provider 避免真实网络调用。
  - `src/mail/provider/__tests__/resend-provider.test.ts`：  
    - 覆盖 Resend provider 对 env 配置的校验、缺失字段时的 warning 以及模板渲染/发送流程，测试中会在 `beforeEach/afterEach` 恢复 `websiteConfig.mail` 与 `serverEnv`，防止污染。

### 2.3 API Routes 与基础设施

- API Routes：
  - `src/app/api/__tests__/chat-route.test.ts`  
  - `src/app/api/__tests__/analyze-content-route.test.ts`  
  - `src/app/api/__tests__/generate-images-route.test.ts`  
  - `src/app/api/__tests__/distribute-credits-route.test.ts`  
  - 这些测试验证 API 的 envelope（`success/error/code/retryable`）、鉴权、限流与 usecase 调用。

- AI 文本分析工具：
  - `src/ai/text/utils/__tests__/analyze-content-handler.test.ts`  
  - `src/ai/text/utils/__tests__/performance.test.ts`  
  - `src/ai/text/utils/analyze-content/__tests__/*`（provider-factory / scraper）  
  - 用于验证文本分析 orchestrator 与抓取器/提供者的行为。

- 领域工具与 hooks：
  - `src/lib/__tests__/credits-settings.test.ts`：  
    - 覆盖 `credits-settings` 适配层，验证 `isCreditsEnabled` / `getCreditsGlobalConfig` 行为。  
  - `src/lib/__tests__/domain-error-ui-registry.test.ts`：  
    - 验证错误 UI 策略 registry 对典型 code（Auth/Credits/Payment/Storage）的映射。
  - `src/hooks/__tests__/use-ai-error-ui.test.ts`  
  - `src/hooks/__tests__/use-storage-error-ui.test.ts`  
    - 验证 AI/Storage 领域 hook 如何组合 registry + `getDomainErrorMessage` 输出正确的 toast 行为。
  - `src/lib/user-lifecycle/__tests__/user-lifecycle-manager.test.ts`：  
    - 验证 UserLifecycleManager 的钩子执行与错误处理。
  - `src/domain/plan/__tests__/resolve-current-plan.test.ts`：  
    - 验证 plan 解析逻辑。

---

## 3. 新增测试的推荐策略

### 3.0 外部 SDK 与适配层约定

- 对于 Stripe、Next.js Request 等第三方 SDK：
  - 生产代码优先通过“窄接口 + 适配层”暴露给业务逻辑：
    - 例如：`StripeClientLike` / `StripeWebhookEventLike` / `Request` 封装。  
    - 业务层（usecase / handler）只依赖这些 DTO，不直接依赖 SDK 的大而全类型。
  - 测试只依赖这些 Like 类型与 DTO：
    - 构造普通对象 `satisfies StripeWebhookEventLike` / `Request`，通过依赖注入或适配层传入。  
    - 避免在测试中使用 `as any` 或 `as SomeSdkType` 来伪装大类型。
  - SDK 直接调用（如 `new Stripe(...)` / `stripe.webhooks.constructEvent`）集中在适配层内，便于替换和测试。

### 3.1 从“小而精”的单元开始

- 针对新增的领域逻辑（比如 Credits/Billing/AI/Payment 的规则）：
  - 优先在与实现相邻的 `__tests__` 目录下添加单元测试。  
  - 覆盖：
    - 不同输入（包括边界条件）下的业务分支；  
    - 与外部依赖（Repository/外部 API）的交互是否按预期调用 / mock。

- 对纯函数或轻量工具（如 config 适配器、错误策略等）：
  - 一个文件 1–3 条测试足够，重点是锁行为，不必覆盖所有枝节。

### 3.2 再视需要补集成 / API 测试

- 当逻辑跨多个层级（例如 Action → Usecase → Domain）时：
  - 为关键路径增加单独的集成测试：  
    - 示例：`billing-to-credits.integration.test.ts` / API Route tests。  
  - 目标是覆盖跨模块协作是否正确，而不是重复单元测试里的断言。

- 新增 API Route 时：
  - 建议参考现有 API 测试样例：  
    - 使用 `app/api/__tests__` 下的模式，构造请求、mock 依赖、断言 JSON envelope（`success/error/code/retryable`）。  
  - 至少覆盖：
    - 鉴权失败（401/403）；  
    - 参数非法（400）；  
    - 正常请求（200）；  
    - DomainError 分支（如 `CREDITS_INSUFFICIENT_BALANCE`）。

### 3.3 Hooks 与 UI 行为测试

- 对复杂 hooks（如 AI/Credits/Storage 错误 UI hook、Payment hooks）：
  - 尝试在 `src/hooks/__tests__` 中增加少量测试，使用 Vitest + 简单 mock，而不是引入完整渲染环境。  
  - 测试重点：
    - 给定特定 `code` 时调用了正确的 toast API（info/warning/error）。  
    - 返回的 message 与 `getDomainErrorMessage` + registry 的组合逻辑一致。

- 对 UI 组件：
  - 本项目当前并未大规模使用 React Testing Library；如需增加，可针对关键组件（如极复杂的表单/交互）谨慎引入。  
  - 一般建议优先测试 hooks + API + usecases，把 UI 层保持尽量薄。

### 3.4 共享测试 Helper

- `tests/helpers/credits.ts`：提供 `createCreditDistributionServiceStub`、`createMembershipServiceStub` 等工具，减少在积分领域重复构造 mock。
- `tests/helpers/mail.ts`：构建 Fake Mail provider，支持模板/原始邮件的成功或失败路径，所有 Mail 测试应通过该 helper 获取 fake。
- `tests/helpers/payment.ts`：包含具备事务感知的 `InMemoryPaymentRepository` 与 Fake `CreditsGateway`/`NotificationGateway`。  
  - 生产代码调用 `PaymentRepository.withTransaction` 时必须将获得的 `tx` 传入 `insert/update/findBySessionId`，并使用 `createCreditsTransaction(tx)` 传递给 Credits gateway。  
  - 相关测试新增时，务必复用该 helper 以获得 transaction 校验能力，否则事务链路可能被遗漏。

---

## 4. Server Actions 测试策略（actions 层）

本项目大量使用 `next-safe-action` 定义 Server Actions，整体约定是：

- **领域规则、计费和积分逻辑**：在 Domain / Service 层测试（`src/domain/**/__tests__`、`src/credits/**/__tests__`、`src/payment/services/__tests__`）。  
- **Actions 层**：只关注「入参校验 + 鉴权/上下文 + 错误映射/envelope」，避免在 actions 测试里重复验证业务细节。

### 4.1 覆盖优先级：哪些 actions 需要测试

优先为以下类别的 actions 编写/补充测试（集中放在 `tests/actions/*.test.ts`）：

- a）计费/订阅相关（Payment/Billing）  
  - 如：`create-customer-portal-session`、`create-checkout`、`create-credit-checkout`、`get-active-subscription`。  
  - 重点验证：DB/Payment Provider 报错时的 DomainError 映射、用户不匹配/缺少 customerId 等场景。
- b）积分消耗/分发相关（Credits）  
  - 如：`consume-credits`、积分余额/交易查询、lifetime 状态查询等。  
  - 重点验证：`DomainError` 透传与 `UnexpectedError` 包装、必填字段校验。
- c）AI 调用相关（Chat / 文本分析 / 图片生成）  
  - 如：聊天、内容分析、图片生成 usecase 对应的 actions（如果存在）。  
  - 重点验证：积分不足 / 频控 / AI Provider 异常时的错误 envelope 与 code。
- d）用户/权限相关（User / Profile / Admin 操作）  
  - 涉及敏感操作（如修改角色、禁用用户等）的 actions，应至少覆盖鉴权与禁止路径。

对于纯 UI 辅助或简单透传的 actions，如果其行为已经由 usecase/domain 层测试覆盖，可以暂缓单独编写 tests。

### 4.2 单元为主，辅以少量集成

Actions 层的测试风格建议统一为：

- **单元视角为主**：  
  - 通过 `tests/helpers/actions.ts` 集中 mock safe-action 与 logger，在具体测试文件中 `import '../helpers/actions';` 即可将 `userActionClient.action` / `adminActionClient.action` stub 成「直接暴露内部实现」的函数。  
  - 直接调用 `someAction({ parsedInput, ctx })`，对结果或抛出的错误做断言。  
  - 通过 `vi.mock` 注入 fake domain/service（如 `consumeCredits`、`createCustomerPortal` 等），只验证 actions 对这些依赖的调用与错误处理。
- **少量集成视角**：  
  - 对于跨越多层的关键链路（如「Action → Usecase → Billing/Credits → Repository」），可以增加一两条集成测试，使用真实的 domain/service + InMemory Repository（参考 `tests/helpers/payment.ts`、Credits helpers）。  
  - 集成测试主要用于验证「组合行为」和事务/幂等性，不必覆盖所有分支。

### 4.3 示例：consume-credits Action

`tests/actions/consume-credits-domain-error.test.ts` 已体现了推荐的写法，关键点总结如下（下例等价于通过 `tests/helpers/actions.ts` 引入的统一 mock）：

```ts
// 通过 mock safe-action，将 actionClient.action 退化为“原始实现”
vi.mock('@/lib/safe-action', () => ({
  userActionClient: {
    schema: () => ({
      action: (impl: unknown) => impl,
    }),
  },
}));

// mock 领域服务入口
vi.mock('@/credits/credits', () => ({
  consumeCredits: vi.fn(),
}));
```

测试用例聚焦在 actions 层职责：

- 正常路径：校验 `consumeCredits` 被正确调用，返回 `{ success: true }`：  
  - 业务细节（FIFO 消耗、剩余额度等）在 `credits` 模块自己的测试中验证。  
- 出现 `DomainError` 时：直接 `rethrow`，确保 `code` / `retryable` 被保留，交由上层 envelope/UI 处理。  
- 出现非 `DomainError`（如 `Error('unexpected')`）时：包装成 `DomainError({ code: ErrorCodes.UnexpectedError, retryable: true })`。

这个模式可以复用到其它 Credits 相关 actions，只需替换被 mock 的 domain/service 函数和输入 schema。

### 4.4 示例：Payment / Billing 相关 Action

以 `tests/actions/create-customer-portal-domain-error.test.ts` 为例，对 `createPortalAction` 的测试可以作为 Payment 相关 actions 的模板：

- mock `userActionClient`，绕过 safe-action：  
  - 与 Credits 示例相同，通过 `schema().action(impl => impl)` 直接获得内部实现。  
- mock 基础依赖：  
  - `@/db.getDb`：模拟 DB 初始化失败或返回 transaction 句柄。  
  - `next-intl/server.getLocale`：返回固定 locale，避免依赖 i18n 运行时。  
  - `@/payment.createCustomerPortal`：作为 PaymentProvider 的入口，用于模拟支付系统正常/异常返回。  
  - `@/lib/urls/urls.getUrlWithLocale`：返回固定 URL，确保断言稳定。

测试重点：

- 当 `getDb` 抛出 `DomainError` 时，action 不做额外包装，直接 `rethrow`，保证上游可以看到原始 `code` / `retryable`。  
- 当 `getDb` 或 `createCustomerPortal` 抛出普通 `Error` 时，将其统一包装为 `UnexpectedError`，确保：  
  - 前端或 API Route 可以基于 `code` 做统一 fallback；  
  - 日志中仍能记录原始错误（通过 `getLogger`，在测试中可 mock 掉）。

对于其它 Payment/Billing actions（如 checkout / credit checkout），建议沿用同样结构：

- actions 测试：mock Payment Provider，验证入参构造、错误包装和 DomainError 透传。  
- Payment Adapter/Service 测试：在 `src/payment/services/__tests__` 中验证与 Repository / Billing / Credits 的协作。

---

## 5. 错误模型与测试配合

本项目的错误模型围绕 `DomainError` + `ErrorCodes` + envelope 与前端 Hook/registry 展开，测试时建议对齐这套约定：

- 服务端：
  - 抛业务错误时使用 `DomainError`，并在测试中断言：
    - `code` 属于 `ErrorCodes` 中定义的值；  
    - `retryable` 的含义是否与 HTTP status 映射一致（`retryable: true` 通常对应 5xx）。
  - API Route 测试中检查 JSON 响应包含：
    - `success`、`error`、`code`、`retryable` 字段；  
    - 与错误模型文档中的约定一致（参见 `docs/error-logging.md`）。

- 前端：
  - 避免在测试中直接断言字符串常量（尤其是文本），优先断言：
    - 是否调用了正确的 toast API；  
    - 使用了正确的 i18n key（通过 `getDomainErrorMessage` 配置）。

---

## 5. 运行测试的建议顺序

在本地开发时，可以按以下顺序增量运行测试：

1. **针对改动模块的单元/集成测试**  
   - 例如修改 Credits 领域时，只跑 `src/credits/**/__tests__/*.test.ts` 与相关 usecase/API 测试。  
   - 在 VSCode/编辑器中利用 Vitest 的 Watch / Test Explorer 加快反馈。
2. **按功能块运行一组测试**  
   - 在准备合并或发布前，根据改动范围跑相应 test suite：  
     - Credits/Billing/Payment 相关改动 → 对应领域与 usecase/API 测试。  
     - AI 相关改动 → AI 文本/图片 usecase + API tests。
3. **全量测试与 E2E**  
   - 做较大的重构或准备发布前，运行：
     - `pnpm lint`  
     - `pnpm test`  
     - 视需要运行 `pnpm test:e2e`（需要可用的本地或预发布环境）。

通过遵循上述策略，可以在保持测试套件健康的前提下，以较低成本获得对关键路径的良好覆盖。
