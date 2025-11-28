# 仓库架构体检报告：可维护性 / 复用性 / 耦合度 / 测试支撑

> 范围：基于 `.codex/plan/repo-architecture-review-maintainability-reuse-coupling.md` 约定，对当前仓库从可维护性、高复用、低耦合三个维度进行一次横向审查，并单独评估测试覆盖与可测性。仅输出分析与建议，不进行代码改动。

## 1. 全局概览

- **整体评价**：
  - 可维护性：**偏高**。目录结构清晰、领域模块化（credits / payment / billing / storage / ai / newsletter 等），TypeScript 严格（`strict` + `noUncheckedIndexedAccess`），多数复杂逻辑集中在 domain/usecase 层，并有成体系的日志与错误码体系支撑。
  - 复用性：**较好**。`src/lib` / `src/hooks` / `src/components/ui` / `src/lib/server/usecases` 形成了较稳定的复用层，credits / billing / payment / AI 等核心域抽象了 domain service / gateway / usecase 等层次，减少跨域复制。
  - 耦合度：**中等偏好**。路由 / actions 大多只面向 domain/usecase 层；infra 层（db / storage / notification）以接口或 provider 方式暴露。但也存在少量“多责任类”（如 `StripePaymentService`）、配置与业务逻辑耦合（`websiteConfig` / env 与服务实例化混在一起）的情况。
  - 测试支撑：**关键路径较完备，边缘区域有空洞**。credits / billing / payment / AI usecases / 部分 API Route 都有针对性单测/集成测及 e2e，用例量可观；但某些 action、部分 UI 逻辑、以及少数 API（如 search）测试缺口明显。

- **代表性优点**：
  - 清晰的模块地图（README + `src/routes.ts` + `CLAUDE.md`）以及 credits/payment/billing/AI 的领域分层；
  - 统一的错误码 + DomainError + envelope + UI-error-registry 机制（`src/lib/domain-errors.ts`、`src/lib/server/error-codes.ts`、`src/lib/domain-error-utils.ts`、`src/lib/domain-error-ui-registry.ts`）；
  - usecase 层封装业务流程，API Route / Server Action 只做协议与边界处理（例如 `executeAiChatWithBilling`、`analyze-web-content-with-credits` 等）。

- **主要风险点（跨维度）**：
  - 支付与计费实例化仍然“胖服务 + 直接读 env/配置”，对多 Provider / 多租户 / 多 plan 配置切换不够友好（`src/payment/services/stripe-payment-service.ts`、`src/ai/billing-config.ts`）。
  - 少数 API / action 没有完全对齐统一 envelope / DomainError 规范，导致错误 UI 策略与日志/指标体系难以完全复用（`src/app/api/search/route.ts`、`src/actions/subscribe-newsletter.ts` 等）。协议层差异的细节分析已在 `protocol-future-techdebt-report.md` 中给出，本报告只保留架构视角。
  - 测试覆盖聚焦核心域，对 UI 组件（特别是复杂导航/交互）与部分边缘协议缺乏系统性验证。

---

## 2. 可维护性

### 2.1 全局评价

- **结构层面**：
  - 顶层目录与 `README.md`/`CLAUDE.md` 对齐，领域划分清晰：`src/credits`、`src/payment`、`src/domain/billing`、`src/lib/server/usecases` 等边界明确。
  - `tsconfig.json` 使用 `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`，强化类型安全，有利于长期维护。
  - `src/routes.ts` 集中声明路由常量，避免魔法字符串散落；有清晰的 `protectedRoutes` / `routesNotAllowedByLoggedInUsers` 列表，提升可读性。

- **实现层面**：
  - 复杂逻辑倾向集中在 domain/usecase 层，例如：
    - `src/credits/domain/credit-ledger-domain-service.ts`：明确职责、良好的方法拆分（验证、事务操作、FIFO 过期处理等），并通过 repository 接口解耦持久化细节。
    - `src/lib/server/usecases/execute-ai-chat-with-billing.ts`：将 AI chat + 积分计费 + 免费配额 + 日志打点集中在 usecase 中，API Route 只负责协议校验与 envelope。
  - UI 层（如 `src/app/[locale]/(protected)/settings/credits/layout.tsx` + `credits/page.tsx` + `src/components/settings/credits/credits-page-client.tsx`）职责分层清晰：布局组件负责头部与文案，Page 负责 feature gate（`isCreditsEnabled` 与 redirect），Client 组件负责 tabs 状态与内容组合。
  - 日志与错误处理使用统一工具（`getLogger`、`ErrorCodes`、`DomainError`），减少散乱 `console.log` 与 ad-hoc 错误处理。

### 2.2 正面示例

1. **Credits 域的领域服务与验证逻辑集中，接口清晰**  
   - 文件：`src/credits/domain/credit-ledger-domain-service.ts`  
   - 特点：
     - 构造函数通过 `ICreditLedgerRepository` + `dbProvider` 注入 infra，便于测试与替换实现。
     - `validateAddCreditsPayload`、`consumeCredits` 等方法对输入进行显式校验，并通过领域错误（`InvalidCreditPayloadError` / `InsufficientCreditsError`）表达业务失败。
     - `processExpiredCreditsForUsers` 做了“best-effort”批处理，详细注释解释行为与日志记录策略，有利于未来维护。

2. **AI Chat with billing usecase 单一职责清晰，边界明了**  
   - 文件：`src/lib/server/usecases/execute-ai-chat-with-billing.ts`  
   - 特点：
     - 函数注释清晰定义责任（扣费 + 调用 AI）和调用前/调用后的期望行为。
     - 将免费额度计数（`incrementAiUsageAndCheckWithinFreeQuota`）、credits 扣减（`consumeCredits`）与日志（`getLogger`）都封装在 usecase 内部，避免 API Route 复制逻辑。
     - 对输入进行了基本校验（messages / model / webSearch），并抛出带错误码的 `DomainError`，与文档和 UI Error Handling 保持一致。

3. **Settings / Credits UI 分层合理，代码简洁易读**  
   - 文件：
     - `src/app/[locale]/(protected)/settings/credits/page.tsx`
     - `src/app/[locale]/(protected)/settings/credits/layout.tsx`
     - `src/components/settings/credits/credits-page-client.tsx`  
   - 特点：
     - Page 层只负责 feature flag + redirect；Layout 负责 breadcrumbs 和文案，Client 组件负责 tabs 状态管理与子组件组合（`CreditsBalanceCard`、`CreditPackages`、`CreditTransactions`）。
     - `credits-page-client.tsx` 使用 `nuqs` 的 `useQueryState` 管理 URL tab 参数，便于调试与分享，逻辑集中在一个地方。

4. **Storage 抽象简洁，易于替换 provider**  
   - 文件：`src/storage/index.ts`  
   - 特点：
     - 通过 `StorageProvider` 接口与 `defaultStorageConfig` 注册 provider，并在 `initializeStorageProvider` 中根据 `websiteConfig.storage.provider` 决定具体实现。
     - `uploadFile` / `deleteFile` 提供聚合 API，业务只依赖高层接口而非具体 SDK。

### 2.3 反面 / 需要留意的示例

1. **StripePaymentService 职责偏多，可进一步拆分**  
   - 文件：`src/payment/services/stripe-payment-service.ts`  
   - 问题：
     - 构造函数内直接负责 env 校验、Stripe client 实例化、credits gateway / notification / repos / billingService 的构建，聚合了**配置解析 + infra wiring + 领域服务**三类职责。
     - `StripePaymentService` 同时承担支付入口（`PaymentProvider`）与 Stripe webhook 处理委托（`handleWebhookEvent`）责任，虽然内部使用 `StripeCheckoutService` / `CustomerPortalService` / `SubscriptionQueryService` 分拆，但整体类仍然较厚。
   - 影响：降低可读性与可扩展性（增加第二支付 Provider 或多租户配置时，需要改动过多逻辑）。

2. **部分 Server Action 的错误处理未完全对齐 DomainError 规范**  
   - 文件：`src/actions/subscribe-newsletter.ts`  
   - 问题：
     - 在失败路径中返回 `{ success: false, error: '...' }`，缺少统一的 `code` / `retryable` 字段，也未使用 `DomainError`，与 `docs/error-codes.md` 和 `src/lib/domain-error-utils.ts` 所建立的错误处理策略不完全一致。
   - 影响：前端无法使用通用的错误 UI 策略（如 `useAuthErrorHandler` / `useCreditsErrorUi` 等）来处理该 action 的错误，增加未来维护成本。

3. **部分路由的错误 envelope 与文档不一致**  
   - 文件：`src/app/api/distribute-credits/route.ts`  
   - 问题：
     - 401 分支返回 `NextResponse('Unauthorized', ...)`，与项目“统一 envelope”约定不一致（README / `docs/api-reference.md` / `src/lib/domain-error-utils.ts` 中均强调统一 `success / error / code / retryable` 结构）。
   - 影响：调用方需要写专门分支处理该路由，与其它 API 不一致，降低整体可维护性。

---

## 3. 复用性 / 抽象质量

### 3.1 全局评价

- `src/lib` 作为复用层组织较好，提供：
  - domain-error / error codes / error UI 映射（`domain-errors.ts`、`server/error-codes.ts`、`domain-error-utils.ts`、`domain-error-ui-registry.ts`）；
  - auth / safe-action 封装（`auth.ts`、`auth-domain.ts`、`safe-action.ts`、`auth-client.ts`）；
  - logging（`logger.ts`、`server/logger.ts`、`user-lifecycle/logger.ts`）；
  - user lifecycle hooks（`src/lib/user-lifecycle/**`）；
  - URL / metadata / i18n helpers 等。
- `src/hooks` 将各领域的错误 UI 处理和数据访问封装为 hooks（`use-ai-error-ui.ts`、`use-credits-error-ui.ts`、`use-storage-error-ui.ts`、`use-auth-error-handler.ts` 等），减少重复的 UI fallback 逻辑。
- `src/components/ui` 提供一套 Radix + Tailwind UI primitives，复用充分。

整体来看，**重复逻辑主要集中在个别尚未完全纳入统一抽象的边缘区域（例如部分 action / 部分 API 的错误处理）**，核心域具备良好的抽象与复用。

### 3.2 正面示例

1. **DomainError + ErrorCodes + UI Registry 形成完整复用闭环**  
   - 文件：
     - `src/lib/server/error-codes.ts`
     - `src/lib/domain-errors.ts`
     - `src/lib/domain-error-utils.ts`
     - `src/lib/domain-error-ui-registry.ts`  
   - 特点：
     - 错误码声明集中在 `error-codes.ts`，DomainError 封装统一结构，`domain-error-utils.ts` 提供 envelope 解包和 i18n 文案解析，UI registry 则负责 code → UI 行为映射。
     - 前端组件/页面通过 hooks（如 `useAiErrorUi`、`useCreditsErrorUi`）消费这些抽象，避免到处写 `if (code === '...')`。

2. **Credits 域的多层抽象复用**  
   - 文件：`src/credits/domain/*`、`src/credits/services/*`、`src/credits/data-access/*`、`src/credits/utils/period-key.ts`  
   - 特点：
     - clear domain service（`CreditLedgerDomainService`）、service 层（`CreditLedgerService` / `CreditsGateway`）与 data-access 层。
     - `CreditsGateway` 暴露统一接口给 payment / billing / usecase，并在内部使用 domain service/ repository。
     - `period-key.ts` & plan-policy/lifetime-membership 等为多处场景的共同逻辑提供可复用工具。

3. **lib/server/usecases 将 AI/credits/billing 的跨域逻辑抽离成可复用用例**  
   - 文件：`src/lib/server/usecases/execute-ai-chat-with-billing.ts`、`analyze-web-content-with-credits.ts`、`generate-image-with-credits.ts`  
   - 特点：
     - API Route / Server Action 只需关心请求解析与 envelope，具体 AI 调用 + 积分扣费由 usecase 处理，减少重复。
     - 多个 usecase 在 credits / ai-usage / 日志模式上保持一致，复用度高。

4. **Storage / Notification 通过接口抽象 provider**  
   - 文件：
     - `src/storage/index.ts` + `src/storage/provider/s3.ts`
     - `src/notification/notification.ts` + `src/notification/discord.ts` / `feishu.ts`  
   - 特点：
     - 统一接口 `StorageProvider` / 通知 gateway，便于扩展其他 provider。

### 3.3 可进一步提升复用性的点

1. **Action 错误处理可统一为 DomainError/envelope 模式**  
   - 文件：`src/actions/subscribe-newsletter.ts` 等  
   - 现状：有些 action 手动返回 `{ success: false, error: ... }`，没有 `code`，无法复用 `domain-error-utils` 和 UI registry。
   - 建议：
     - 将失败情况改为抛出 `DomainError`（带 `code`），或至少补充 `code` 字段并在 `docs/error-codes.md` 注册；
     - 前端统一通过 `unwrapEnvelopeOrThrowDomainError` 或领域 hooks 处理错误。

2. **StripePaymentService 的 wiring 逻辑可下沉到“factory/config 层”**  
   - 文件：`src/payment/services/stripe-payment-service.ts`  
   - 现状：实例化 stripe client、credit gateway、notification gateway、repos 与 billingService 的逻辑都在构造函数内，对所有调用方可见。
   - 建议：
     - 抽出 `createStripePaymentService(config)` 工厂，集中处理 env/websiteConfig 的解析与依赖注入；
     - `StripePaymentService` 自身只关注 PaymentProvider 行为，以及与 Stripe webhook 的映射逻辑。

3. **AI 计费配置的复用维度不足**  
   - 文件：`src/ai/billing-config.ts`（未在本报告全文展示，但在其它 plan/report 已分析）  
   - 现状：计费规则主要是静态常量，缺乏 plan / region 等维度的复用能力。
   - 建议：
     - 抽象为 `BillingRuleRepository` 或配置服务，让不同 plan / 环境可以覆盖默认规则，而不是在 usecase 中硬编码。

---

## 4. 耦合度 / 边界清晰度

### 4.1 全局评价

- UI/路由层（`src/app`）整体上只依赖：
  - Server Actions（`src/actions/**`）进行数据/副作用操作；
  - 或 `src/lib`、`src/payment` 提供的聚合服务（例如 credits 相关查询/消费）。
- Domain/service 层（`src/credits`、`src/domain/billing`、`src/payment/services`、`src/lib/server/usecases`）之间有明确依赖方向：
  - `payment` 依赖 `credits`（通过 gateway/service），反向依赖较少；
  - `domain/billing` 作为纯领域服务，可被 payment/credits 等复用；
  - infra（db / storage / notification）通过接口（Repository / Provider）暴露给上层，较少见到 UI 直接依赖 infra。
- 主要耦合点集中在：
  - 支付与 env / 配置强耦合（如 `StripePaymentService` 直接读 `serverEnv` 与 `isCreditsEnabled`）；
  - 计费规则与代码（`ai/billing-config`）硬编码绑定。

### 4.2 边界健康的示例

1. **Credits 域的分层依赖方向清晰**  
   - 文件：`src/credits/domain/*`、`src/credits/services/*`、`src/credits/data-access/*`  
   - 特点：
     - domain service 只依赖 repository 接口与 `DbExecutor` 抽象，不依赖具体 DB 实现。
     - service 层（如 `CreditLedgerService`）负责将 domain service 与外部调用者（payment/billing/usecases）连接，边界清晰。

2. **AI + Credits 用例层位于 lib/server/usecases，作为跨域编排层**  
   - 文件：`src/lib/server/usecases/execute-ai-chat-with-billing.ts`  
   - 特点：
     - usecase 既依赖 AI 功能（`streamText`、billing config、ai usage）又依赖 credits，但 API Route 只依赖 usecase，不直接感知 credits/billing 细节。
     - 有利于未来将 AI provider 或 credits 体系替换为其他实现时，只在 usecase/下层调整。

3. **Storage 与 WebsiteConfig 之间通过配置解耦业务**  
   - 文件：`src/storage/index.ts` + `src/config/website.tsx`  
   - 特点：
     - `websiteConfig.storage.provider` 决定具体 provider，业务层只通过 `uploadFile`/`deleteFile` 操作。

### 4.3 耦合偏重 / 边界模糊的示例

1. **StripePaymentService 同时承担配置、依赖注入与业务逻辑**  
   - 文件：`src/payment/services/stripe-payment-service.ts`  
   - 问题：
     - 直接读取 `serverEnv` 与 `isCreditsEnabled`，并在构造函数中 new 多个依赖（`CreditLedgerService`、`DefaultNotificationGateway`、`UserRepository`、`PaymentRepository`、`StripeEventRepository`、`DefaultBillingService` 等）。
     - `DefaultBillingService` 的构建也耦合在该类内部，将“计费策略”、“credits 启用开关”与“支付 provider 实现”绑定在一起。
   - 影响：
     - 想要支持多租户（每租户不同 Stripe key / webhook secret）或切换其他 PaymentProvider 时，需要拆散这一大块逻辑，执行成本高。
   - 建议：
     - 引入 `PaymentProviderFactory` 或配置层，将 env/config → 依赖注入逻辑集中在工厂中；
     - `StripePaymentService` 只依赖抽象接口（billingService、creditsGateway、notificationGateway 等），不直接感知 env/config。

2. **AI 计费规则与 usecase 耦合**  
   - 文件：`src/lib/server/usecases/execute-ai-chat-with-billing.ts` + `src/ai/billing-config.ts`  
   - 问题：
     - usecase 内直接调用 `getAiChatBillingRule`，billing rule 实现与 usecase 耦合在同一代码路径，无法基于不同 plan / 促销策略动态调整。
   - 建议：
     - 引入 `BillingRuleProvider` 接口，从外部注入；或在 usecase 的参数中加入 `billingRule`，由上层根据当前用户/plan 决定。

3. **部分 API 与统一协议的耦合不完善**  
   - 文件：`src/app/api/distribute-credits/route.ts` + `src/app/api/search/route.ts`（协议与错误码差异的细节见 `protocol-future-techdebt-report.md`）  
   - 问题（架构层概括）：
     - 部分路由在非 2xx 场景返回的 payload 形态与统一 envelope 约定不一致，调用方需要写特例逻辑。
   - 建议：
     - 将 API Route 的错误响应通过 shared helper 统一封装为 envelope，本报告只给出分层和耦合方向建议，具体字段与错误码取值以协议报告为准。

---

## 5. 测试覆盖与可测性

### 5.1 现有测试分布（采样）

- **Credits 域**：
  - 单元/服务测试：
    - `src/credits/domain/__tests__/credit-ledger-domain-service.test.ts`
    - `src/credits/domain/__tests__/plan-credits-policy.test.ts`
    - `src/credits/services/__tests__/credit-ledger-service*.test.ts`（多个变体：errors / plan-policy / register-free 等）。
  - cron / 过期逻辑：
    - `src/credits/expiry-job.test.ts`
    - `src/credits/__tests__/distribute-lifetime-membership.test.ts`
  - 评价：**核心 credits 逻辑测试充分**，验证了 domain service、service、过期任务与终身会员发放路径，可为重构提供安全网。

- **Billing / Payment 域**：
  - billing：`src/domain/billing/__tests__/billing-service.test.ts`、`billing-to-credits.integration.test.ts`，覆盖计费与积分联动逻辑（integration）。
  - payment / Stripe：`src/payment/services/__tests__/stripe-payment-service.test.ts`，模拟 webhook 事件流，验证 credits 发放、lifetime plan、renewal 等路径（通过大量 mock/stub，依赖注入良好）。
  - 评价：**支付/计费路径有较强的可测性与覆盖度**。

- **API Routes**：
  - `src/app/api/__tests__/chat-route.test.ts` 等，对 chat / analyze-content / distribute-credits / generate-images API 的参数校验、授权、调用 usecase 等有覆盖。
  - 示例（`chat-route.test.ts`）：通过 vitest 的 mock 方式替换 `ensureApiUser`、`enforceRateLimit`、`executeAiChatWithBilling`，重点验证参数校验与 envelope。

- **Actions / 其它**：
  - `tests/actions/get-active-subscription.test.ts`
  - `tests/actions/validate-captcha.test.ts`
  - `tests/proxy-helpers.test.ts`
  - `tests/env/client-env.test.ts`

- **E2E 测试**：
  - `tests/e2e/auth.spec.ts`：覆盖基本认证流程。

### 5.2 可测性与缺口

- **已具备的可测性优势**：
  - 多数关键服务通过接口/依赖注入设计（如 `StripePaymentServiceDeps`、`ICreditLedgerRepository`、`DbExecutor` 等），利于通过 mock/stub 构造测试。
  - Usecase 与 API Route 分离，使得 usecase 可以在不依赖 HTTP 层的情况下进行测试。
  - 测试目录结构基本遵循“同模块旁边”或 `__tests__` 约定，有利于维护。

- **明显缺口或改进空间**：
  1. **部分 Server Action / UI 缺少测试**  
     - 板块：`src/actions/**`（如 `subscribe-newsletter.ts`、`consume-credits.ts` 等）与复杂 UI 组件（如 `Navbar`、credits page 的交互组件）目前尚未看到单测/集成测。  
     - 风险：未来调整 envelope 或错误码时，前后端交互可能产生回归；复杂 UI 交互的行为（如 locale 路由、登录状态展示、tab 状态持久化）容易在重构中被破坏。

  2. **部分 API（search 等）未被测试覆盖**  
     - 虽然 `chat` / `analyze-content` / `generate-images` 等路由有测试，但 `search` route 在 `docs/error-logging.md` 被标记为待复查，且未在 `src/app/api/__tests__` 看到对应测试。

  3. **E2E 覆盖集中在 auth，未覆盖 billing/credits/AI 的关键 happy path**  
     - 当前 `tests/e2e/auth.spec.ts` 专注认证流程，对 settings/credits 页面、Stripe checkout 流程、AI 功能等尚无端到端验证。

### 5.3 测试改进建议（按优先级）

- **P0 / P1（应优先考虑）**：
  1. 为 `/api/search` 补充 route 测试（包括正常查询、错误 path、错误码映射）并对齐 envelope。  
  2. 为 `src/actions/subscribe-newsletter.ts`、`validate-captcha.ts` 等补充 action 级测试，覆盖正常与错误路径，以及 envelope 与错误码行为。

- **P2（中期优化）**：
  3. 针对重要 UI 流程（如 settings/credits 页面、Navbar 登录状态切换）补充组件/集成测试，至少覆盖：路由条件渲染、tab 状态、权限保护等核心交互。
  4. 扩展 E2E 测试用例，增加：用户购买 credits、订阅 plan、AI chat 调用成功/失败体验的 happy path 验证，以防止未来重构破坏核心闭环。

---

## 6. 综合改进建议（按优先级）

> 以下建议仅针对当前“可维护性 / 复用性 / 耦合度 / 测试支撑”视角的发现，具体实施可以在独立 plan 中拆解。

### P0（近期建议）

1. **统一 API Route 与 Server Action 的错误 envelope 与 DomainError 使用**  
   - 涉及：`src/app/api/distribute-credits/route.ts`、`src/app/api/search/route.ts`、`src/actions/subscribe-newsletter.ts` 等。  
   - 动作：
     - 将所有 API 400/401/5xx 响应统一包装为 `{ success: false, error, code, retryable }`；
     - 对 action 中的错误路径使用 DomainError 或至少补充 `code` 字段；
     - 更新 `docs/api-reference.md` / `docs/error-codes.md` 保持一致。  
   - 收益：提升调用方与前端错误处理的一致性，降低后续改动时的回归风险，增强可维护性与复用性。

2. **为“协议存在差异”的 API 补齐测试**  
  - 涉及：`/api/search`、`/api/distribute-credits` 等。  
  - 动作：在 `src/app/api/__tests__` 中增加对应 route 测试，覆盖正常响应与错误 envelope。  
  - 收益：为未来协议统一/重构提供安全网。

### P1（中短期建议）

3. **抽离 StripePaymentService 的配置与依赖注入逻辑，降耦合**  
   - 涉及：`src/payment/services/stripe-payment-service.ts`。  
   - 动作：
     - 引入 `createStripePaymentService(config)` 工厂或 `PaymentProviderFactory`，在其中解析 `serverEnv` / `websiteConfig` 并注入依赖；
     - `StripePaymentService` 改为只依赖抽象接口与明确定义的 deps（已部分存在，通过 `StripePaymentServiceDeps`）。  
   - 收益：降低类的复杂度，为未来支持多 Provider、多租户或更复杂计费策略打下基础。

4. **提升 AI 计费规则的可配置性与可测试性**  
   - 涉及：`src/ai/billing-config.ts` + `src/lib/server/usecases/execute-ai-chat-with-billing.ts` 等。  
   - 动作：
     - 抽象 billing rule 为接口 / provider，并在 usecase 中通过参数或依赖注入方式获取；
     - 为不同 plan/环境提供 override 能力，并增加测试覆盖。  
   - 收益：降低 usecase 与硬编码配置的耦合，提升在不同商业模型下的可扩展性。

5. **补齐关键 action 与 UI 组件测试**  
  - 涉及：`src/actions/**` 中尚无测试的 action、`src/components/layout/navbar.tsx`、settings/credits 页面等。  
  - 动作：
     - 行为驱动的测试（以“用户故事”为单位），覆盖登录状态、语言切换、tab 切换、credits 消费/展示等核心路径。  
   - 收益：提升整体可维护性与 refactor 自信度。

### 6.1 P0 / P1 建议影响范围矩阵（概要）

> 详细技术债条目（特别是协议与错误码差异）以 `protocol-future-techdebt-report.md` 为主，本表只从架构与实施成本角度给出概要评估。

| 建议编号 | 建议摘要 | 主要涉及模块/文件 | 影响范围 | 复杂度评估 | 风险点 |
| --- | --- | --- | --- | --- | --- |
| P0-1 | 统一 API/Action 错误 envelope + DomainError 使用 | `src/app/api/*` 部分路由、`src/actions/subscribe-newsletter.ts` 等 | 前后端错误处理链路、日志/监控解析 | 中等：字段调整 + 局部错误处理重构 | 需确保前端 hooks 与 i18n 文案同步更新，避免打破现有 UI 行为 |
| P0-2 | 为协议差异 API 补齐 route 测试 | `src/app/api/search/route.ts`、`src/app/api/distribute-credits/route.ts` | 协议回归检测、CI 反馈质量 | 低：新增测试文件 + 少量 mock | 测试需覆盖 2xx/4xx/5xx 及 envelope 形态，避免遗漏主干路径 |
| P1-3 | 抽离 StripePaymentService 的配置与依赖注入逻辑 | `src/payment/services/stripe-payment-service.ts`、可能新建 factory | 支付域（checkout、webhook、credits 发放） | 中高：需要拆分构造流程并保持现有测试通过 | 需维护现有 `stripe-payment-service.test.ts` 语义，避免打破 webhook/credits side effect |
| P1-4 | 提升 AI 计费规则的可配置性 | `src/ai/billing-config.ts`、`src/lib/server/usecases/*` | AI chat / analyze / image 路径的计费与免费配额 | 中等：引入 billing rule provider 或配置层 | 需保证现有计费结果不变（或变更可控），并补充针对不同 plan 的测试 |
| P1-5 | 补齐关键 action 与 UI 测试 | `src/actions/**`、`src/components/layout/navbar.tsx`、settings/credits 页面 | 关键用户流（登录、导航、credits 页面） | 中等：需要挑选代表性 user story 设计用例 | UI 受路由/i18n 影响，测试环境准备（locale、auth 状态）要明确 |

### P2（中期架构优化建议）

6. **引入统一的“API/Action envelope helper”层**  
   - 动作：
     - 在 `src/lib/server` 或 `src/lib` 内提供 helper，将 `DomainError` → HTTP Response / Action envelope 的转换集中到一处；
     - 所有 API Route / Actions 通过该 helper 构造响应。  
   - 收益：进一步去重错误处理与响应构造逻辑，降低耦合度，提高复用性。

7. **根据现有领域边界整理“领域地图”文档**  
   - 动作：在 `docs/architecture-overview.md` 或新文档中，补充 credits / billing / payment / AI / storage / notification 等模块的依赖关系与职责说明（可复用本报告结构）。  
   - 收益：降低新成员理解成本，为后续重构或模块裁剪提供决策依据。

---

> 本报告聚焦当前代码状态下的架构与代码质量分析，未对未来业务演进做路线图设计。若需要进一步将上述建议拆解为具体重构任务，可在 `.codex/plan` 下新增对应的细化 plan 文档（例如 `credits-billing-payment-refactor.md`），并结合现有 `protocol-future-techdebt-report.md` 统一规划。
