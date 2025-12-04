# 仓库架构体检报告：可维护性 / 复用性 / 耦合度 / 测试支撑（2025-12 基线版）

> 范围：基于 `.codex/plan/repo-architecture-review-maintainability-reuse-coupling.md` 约定，对当前仓库从可维护性、高复用、低耦合三个维度进行一次横向审查，并单独评估测试覆盖与可测性。本报告为 2025-12 的“第二版基线”，仅输出分析与建议，不进行代码改动。

## 1. 全局概览

- **可维护性**：偏高。目录与领域分层清晰（credits / payment / billing / storage / ai / mail / newsletter 等），TypeScript 配置严格（`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 等），复杂业务集中在 domain/service/usecase 层，并有统一的日志和错误模型支撑。
- **复用性**：较好。`src/lib`、`src/hooks`、`src/lib/server/usecases`、`src/credits`、`src/payment` 等形成稳定复用层，错误处理、计费、积分、Webhook、storage、mail 等都有成熟抽象；`tests/helpers/*` 进一步提升测试复用度。
- **耦合度**：中等偏优。UI / actions / API Routes 大多依赖 domain/service/usecase 抽象，infra 通过接口或 provider 暴露；耦合主要集中在对 `websiteConfig` / `serverEnv` 等全局配置的直接读取，以及少量 usecase 与配置模块的耦合。
- **测试支撑**：关键路径覆盖较全。credits / billing / payment / AI usecases、payment webhook、API Routes、错误 UI hooks、user-lifecycle 等具有成体系单元/集成测试；E2E 覆盖 auth 与部分 credits+AI 流程。复杂 UI 行为与完整支付前端流程仍有进一步加强空间。

---

## 2. 可维护性

### 2.1 全局评价

- 结构上，根文档（`README.md`、`docs/architecture-overview.md`、`docs/feature-modules.md`）与代码目录严格对齐：`src/credits`、`src/payment`、`src/domain/billing`、`src/lib/server/usecases`、`src/storage`、`src/mail` 等边界清晰。
- `src/app/api/**` 集中 API Routes，配套 `src/app/api/__tests__/*.test.ts` 的 route 级测试，对协议和错误模型形成显式约束。
- 复杂业务逻辑集中在 domain/service/usecase 层（如 `src/credits/domain/credit-ledger-domain-service.ts`、`src/credits/distribution/credit-distribution-service.ts`、`src/lib/server/usecases/*`、`src/payment/services/*`），UI 和 actions 多数保持“薄”层实现。
- 日志与错误处理统一使用 `getLogger`、`ErrorCodes`、`DomainError`、`domain-error-utils`，降低 ad-hoc 错误处理带来的维护成本。

### 2.2 代表性正面示例

1. **Credits 领域服务：输入验证和事务处理清晰稳定**  
   - 文件：`src/credits/domain/credit-ledger-domain-service.ts`  
   - 特点：
     - `validateAddCreditsPayload` 统一验证 `userId` / `amount` / `type` / `expireDays` / `periodKey`，通过 `InvalidCreditPayloadError` 表达业务错误。
     - `consumeCredits`/`consumeCreditsWithExecutor` 兼容已有事务与非事务场景，使用 `DbExecutor` / `Transaction` 类型守护事务边界；`processExpiredCreditsForUsers` 有详细注释说明 best-effort 语义和日志策略。

2. **AI Chat + 计费 usecase：职责与边界明确**  
   - 文件：`src/lib/server/usecases/execute-ai-chat-with-billing.ts`  
   - 特点：
     - 入参类型清晰，函数开头即对 `messages` / `model` / `webSearch` 做基础校验，异常使用带 code 的 `DomainError` 表达。
     - 内部串联免费额度检查（`incrementAiUsageAndCheckWithinFreeQuota`）、credits 扣减（`consumeCredits`）和 AI 调用（`streamText`），API Route 层只关注 HTTP 协议与 envelope。

3. **Payment 测试辅助：In-memory 仓储与事务对齐逻辑易懂**  
   - 文件：`tests/helpers/payment.ts`  
   - 特点：
     - `InMemoryPaymentRepository` 实现 `PaymentRepositoryLike`，封装 Map 存储、session/subscription 索引与事务句柄校验（`ensureTransaction`），测试只依赖接口，不依赖真实 DB。
     - `createWebhookDeps` 在一个地方集中构造 `paymentRepository` / `creditsGateway` / `notificationGateway` / `billingService` / `logger`，并通过 `withTransactionGuard` 保证 credits 事务与 payment 事务的一致性，便于维护与调试。

4. **Mail service 测试：配置管理与依赖替换清晰**  
   - 文件：`src/mail/__tests__/mail-service.test.ts`  
   - 特点：
     - 使用 `beforeEach` / `afterEach` 管理 `websiteConfig.mail` 变化，避免测试间污染；`fallbackFromEmail` 处理配置中缺失字段。
     - 通过 `createMailProviderStub` 和 `ResendProviderMock` 注入 stub，实现对 `initializeMailProvider` 缓存行为和 `sendEmail` 模板/原始邮件路径的可维护验证。

### 2.3 需要关注的点

1. **全局配置对象读写点相对分散（已部分缓解）**  
   - 初始示例：`src/payment/index.ts` 依赖 `websiteConfig.payment` + `serverEnv`；`src/ai/billing-policy.ts` / `src/ai/billing-config.ts` 直接读取 `websiteConfig.ai.billing`；mail 模块和测试多处直接使用 `websiteConfig.mail`。  
   - 当前进展：已通过 `PaymentProviderFactory`、`AiConfigProvider`（`src/ai/ai-config-provider.ts`）和 `MailConfigProvider`（`src/mail/mail-config-provider.ts`）将 payment/ai/mail 对 `websiteConfig` 的读取集中在少数 provider 模块；后续如果引入多 plan/多租户扩展，应在这些 provider 之上再注入上下文，而不是重新分散读取点。

2. **复杂 UI 行为仍然主要依赖人工验证**  
   - 虽然 API/usecase 层有良好测试，但导航、定价页、AI playground 等 UI 逻辑更多通过文档和约定维护，随着功能增长，维护与重构时的风险会增加。

---

## 3. 复用性 / 抽象质量

### 3.1 全局评价

- 错误处理复用链路完备：`src/lib/server/error-codes.ts`、`src/lib/domain-errors.ts`、`src/lib/domain-error-utils.ts`、`src/lib/domain-error-ui-registry.ts` 和前端 hooks（`useAiErrorUi`、`useStorageErrorUi` 等）形成从错误码到 UI 行为的统一抽象。
- 领域抽象分层明确：credits（domain/service/gateway）、payment（provider/adapter/factory/webhook handler）、AI usecases（chat/analyze/generate）、storage/mail 等都以接口 + adapter 形式暴露能力。
- 公共工具集中：`src/lib/utils.ts`、`src/lib/formatter.ts`、`src/lib/metadata.ts`、`src/lib/urls/urls.ts` 等承载通用逻辑，减少“复制粘贴式工具函数”。
- 测试辅助复用充分：`tests/helpers/payment.ts`、`tests/helpers/mail.ts`、`tests/utils/requests.ts` 等大幅减少测试样板代码。

### 3.2 代表性正面示例

1. **错误模型与 UI 映射的全链路复用**  
   - 文件：`src/lib/server/error-codes.ts`、`src/lib/domain-errors.ts`、`src/lib/domain-error-utils.ts`、`src/lib/domain-error-ui-registry.ts`、`src/hooks/__tests__/use-ai-error-ui.test.ts`  
   - 特点：错误码集中声明，DomainError 封装结构化错误，`unwrapEnvelopeOrThrowDomainError` 统一 envelope 解包；UI registry 与 hooks 将 code 映射为 UI 策略，测试验证了主要路径。

2. **Credits 域：domain/service/gateway 分层复用**  
   - 文件：`src/credits/domain/credit-ledger-domain-service.ts`、`src/credits/services/credit-ledger-service.ts`、`src/credits/services/credits-gateway.ts`、`src/credits/utils/period-key.ts`  
   - 特点：domain 层负责业务规则；service/gateway 封装对外接口；periodKey/plan 策略在 utils/domain 中复用，避免重复实现。

3. **Payment 模块：provider/adapter/factory 模式**  
   - 文件：`src/payment/index.ts`、`src/payment/services/stripe-payment-factory.ts`、`src/payment/services/stripe-payment-adapter.ts`、`src/payment/services/stripe-webhook-handler.ts`  
   - 特点：`PaymentProvider` 接口统一对外能力；factory 从 env/config 构造 provider；adapter 隔离 Stripe 细节；webhook handler 使用 data-access 与 `CreditsGateway` 组合，利于复用与替换。

4. **测试辅助模块：高复用、低心智负担**  
   - 文件：`tests/helpers/payment.ts`、`tests/helpers/mail.ts`  
   - 特点：集中封装复杂依赖（事务、外部 provider），测试只需调用 helper 即可获得一致、可预测的环境。

### 3.3 可改进点

1. **AI 计费规则的注入方式可以更抽象**  
   - 文件：`src/lib/server/usecases/execute-ai-chat-with-billing.ts`、`src/ai/billing-config.ts`  
   - 问题：usecase 直接调用 `getAiChatBillingRule`，使计费策略实现与 usecase 耦合；当按 plan/tenant 动态变更策略时，需要修改 usecase 内部。
   - 建议：抽象 `AiBillingRuleProvider` 接口，通过参数或依赖注入交给 usecase，usecase 只依赖抽象而不依赖具体配置实现。

2. **actions 中的错误处理模式可以通过 helper 收敛**  
   - 示例：`src/actions/get-credit-balance.ts` 等使用 `DomainError` + `ErrorCodes.UnexpectedError` 的 actions。  
   - 建议：在 `safe-action` 或相邻模块提供统一的包装器（如 `withDomainErrorBoundary(span, handler)`），减少重复的 try/catch 模板代码。

---

## 4. 耦合度 / 边界清晰度

### 4.1 全局边界与依赖方向

- UI / 路由（`src/app/**`、`src/components/**`）主要依赖 actions、hooks 和 API，不直接访问 db 或第三方 SDK。
- actions（`src/actions/**`）负责参数校验、用户上下文注入与 envelope 构造，依赖 credits/payment/newsletter 等服务函数。
- domain/service/usecase（`src/credits/**`、`src/payment/**`、`src/lib/server/usecases/**`、`src/domain/billing/**`）承载业务规则，集中访问 data-access 与 infra。
- infra 层（`src/db/**`、`src/storage/**`、`src/mail/**`、`src/notification/**`）通过 interface/provider 暴露能力，避免渗透到 UI 或 actions。

### 4.2 代表性正面示例

1. **Credits ↔ Billing ↔ Payment 边界明确**  
   - Credits 专注积分账本与生命周期；Billing 定义计费策略；Payment 集成 Stripe 与 payment/stripe_event 表。Webhook handler 使用 data-access + `CreditsGateway` 驱动积分更新，Route 层保持简单。

2. **Storage 抽象隔离第三方实现**  
   - 文件：`src/storage/index.ts`、`src/storage/provider/s3.ts`  
   - 特点：`StorageProvider` 抽象上传/删除能力，`initializeStorageProvider` 根据配置选择 provider，业务端不依赖具体 S3 SDK。

3. **Mail 域通过 provider 抽象外部邮件服务**  
   - 文件：`src/mail/index.ts`、`src/mail/provider/resend.ts`、`src/mail/__tests__/mail-service.test.ts`  
   - 特点：统一 `initializeMailProvider` / `getMailProvider` 生命周期管理；模板/原始邮件逻辑封装在 mail 域内部，调用方只需传递业务参数。

4. **测试 helpers 将测试专有耦合限制在测试层**  
   - 文件：`tests/helpers/payment.ts`、`tests/helpers/mail.ts`  
   - 特点：将对事务、通知、外部 provider 的特殊处理集中在 helpers，避免生产代码因测试需求而增加额外耦合。

### 4.3 可改进点

1. **配置/Env 与业务逻辑的耦合可以进一步弱化**  
   - 示例：`src/payment/index.ts`（使用 `websiteConfig.payment` 与 `serverEnv`）、`src/ai/billing-config.ts`、`src/mail/index.ts`。  
   - 建议：为 payment、AI billing、mail 等域引入轻量级 `*ConfigProvider` 抽象，由上层整合 `websiteConfig` 与 env 注入，业务代码仅依赖接口。

2. **测试中对全局配置对象的修改需持续约束**  
   - 虽然当前 mail 测试通过 lifecycle 恢复配置，但新增测试时应保持这一模式，避免在生产代码中形成对可变全局配置的隐性依赖。

---

## 5. 测试覆盖与可测性

### 5.1 测试分布概览

- 领域/服务层：
  - Credits：`src/credits/domain/__tests__/*.test.ts`、`src/credits/services/__tests__/*.test.ts`、`src/credits/distribution/__tests__/credit-distribution-service.test.ts`、`src/credits/expiry-job.test.ts` 覆盖账本、计划策略、分发和过期任务。
  - Billing：`src/domain/billing/__tests__/billing-service.test.ts`、`billing-to-credits.integration.test.ts`。
  - Payment：`src/payment/services/__tests__/stripe-payment-service.test.ts`、`webhook-handler*.test.ts` 覆盖支付与 Webhook 行为。
  - AI：`src/ai/text/utils/__tests__/*.test.ts`、`src/ai/text/utils/analyze-content/__tests__/*.test.ts` 覆盖 analyzer handler、provider factory、scraper 等。
  - Usecases：`src/lib/server/usecases/__tests__/*.test.ts` 覆盖 chat/analyze/generate 的 credits 计费逻辑。
- API Routes：`src/app/api/__tests__/analyze-content-route.test.ts`、`chat-route.test.ts`、`distribute-credits-route.test.ts`、`generate-images-route.test.ts`、`search-route.test.ts`、`storage-upload-route.test.ts` 覆盖主要 API 协议。
- 错误 UI 与 hooks：`src/hooks/__tests__/use-ai-error-ui.test.ts`、`src/hooks/__tests__/use-storage-error-ui.test.ts`、`src/lib/__tests__/domain-error-ui-registry.test.ts` 验证错误码到 UI 策略的映射。
- Mail/Provider：`src/mail/__tests__/mail-service.test.ts`、`src/mail/provider/__tests__/resend-provider.test.ts`。
- E2E：`tests/e2e/auth.spec.ts`、`tests/e2e/credits-and-ai-flows.spec.ts` 覆盖认证和部分 credits+AI 用例。

### 5.2 可测性总结

- 优点：核心域和 API Routes 测试覆盖扎实，usecase/hook 层测试保证错误模型与计费逻辑可靠；测试辅助模块大幅降低测试样板代码。
- 缺口：
  1. 复杂 UI 组件（导航、定价页、AI playground 等）的行为主要依赖人工回归，缺少组件/集成层的显式测试。
  2. 支付前端流程（定价页 → checkout → Webhook 后 UI 状态）尚无完整端到端自动化用例。

### 5.3 测试改进建议

- 短期重点：
  - 为 1–2 ���高价值 UI 流程（如定价页 CTA、AI playground 主要交互）补充轻量级组件/集成测试，覆盖核心渲染和状态切换。
  - 在现有 `tests/e2e/credits-and-ai-flows.spec.ts` 基础上强化断言，确保错误码/文案与错误模型一致。
- 中期目标：
  - 增加至少一个“支付 → credits 更新 → AI 使用”的完整 e2e 场景，形成支付相关的端到端安全网。

---

## 6. 综合改进建议（按优先级）

### P0（高优）

1. **抽象 AI 计费策略注入接口（基础能力已落地）**  
   - 当前状态：已通过 `AiBillingPolicy` + `billing-config` 中的 `setAiBillingPolicy` / `getAiBillingPolicy` 实现可替换策略实例，usecase 通过 `getAi*BillingRule` 间接依赖策略，规则来源统一为 `websiteConfig.ai.billing.*`。  
   - 后续方向：如需 per-plan/per-tenant 策略，可在策略实现中引入 `AiBillingContext` 并在上层组合根注入不同策略实例（协议与计费规则侧的细化建议见 `.codex/plan/protocol-future-techdebt-report.md` 技术债 #5）。
2. **建立关键 UI 流程的最小测试基线（尚未启动）**  
   - 目标：为定价页 CTA、AI playground 等高风险 UI 增加少量组件/集成测试，覆盖核心渲染和状态切换，降低重构和样式调整带来的行为回归风险；当前仍主要依赖手工回归，尚未有系统性的 UI 测试基线。

### P1（中优）

1. **收敛 action 层错误处理模式（尚未落地）**  
   - 在 `safe-action` 或相邻模块提供统一的 DomainError 包装 helper，减少重复 try/catch，统一日志与错误码行为（对应协议层技术债 #2）；当前各 action 仍各自实现错误包装逻辑。  
2. **按领域收敛配置 Provider / Adapter（核心域已完成首轮收口）**  
   - 当前状态：payment 通过 `PaymentProviderFactory` + Stripe 工厂集中消费 `serverEnv` 中的 Stripe 配置；AI 通过 `AiConfigProvider` + `AiBillingPolicy` / `billing-config` 从 `websiteConfig.ai.billing` 提供计费规则；mail 通过 `MailConfigProvider` 提供邮件配置；storage 领域已通过 `StorageConfig` + `storage/index.ts`（`initializeStorageProvider` / `uploadFile` 等）集中 `websiteConfig.storage` 与 `serverEnv.storage` 的读取。  
   - 约束与后续方向：将对 `websiteConfig` / `serverEnv` 的读取限制在这些领域级 Provider/Adapter（payment / ai / mail / storage 等）内部，其余 domain/service/usecase/API route 层只能依赖对应 Provider；新增领域（如 newsletter / analytics）应复用同一模式。后续如需引入 plan / tenant 等维度，可在各自 Provider 内按需扩展，刻意避免提前设计全局 AppConfig“大总管”，以保持解耦与可演进性。

### P2（低优）

1. **逐步扩展 UI 与 hooks 的测试覆盖**  
   - 从错误 UI hooks、高复用 UI 组件开始，逐步提高前端可测性。
2. **扩展 E2E 覆盖更多业务闭环**  
   - 在已有 auth 与 credits+AI 流程基础上，逐步引入支付/存储等闭环测试，为中长期演进提供回归保障。

---

## 附录 A：架构视角体检（模块边界 / 依赖关系）

> 侧重于「模块边界是否清晰、依赖方向是否合理，是否存在高耦合热点与结构性技术债」，与前文的可维护性/复用性报告互为补充。

### 一、架构整体印象

- **清晰度：偏高**  
  - 顶层分层基本稳定：`app`（路由/UI） → `actions/api` → `lib/server/usecases` → `domain` / `credits` / `payment` / `ai` → `db` / 外部 Provider。  
  - 核心域（credits / payment / billing / ai）均有独立目录与文档（`docs/architecture-overview.md`、`docs/credits-lifecycle.md` 等）支撑，降低理解成本。
- **演进性：中高**  
  - 使用 usecase 层封装复杂业务流（如 `execute-ai-chat-with-billing`、`distribute-credits-job`），HTTP/API 层保持「薄控制器」，便于新增调用方（CLI/worker）。
- **复杂度：集中但可控**  
  - 复杂度主要集中在 `credits ↔ billing ↔ payment ↔ ai` 协作上，其余模块（newsletter / storage / mail 等）复杂度明显较低。

### 二、模块边界与职责

- **`src/app`（路由与 UI）**  
  - `[locale]/(marketing)` / `(protected)` 通过 segment 清晰区分开放页面和登录后应用；页面层基本通过组件 + hooks + actions 访问领域能力，没有直接触达 DB 或低层 infra。
  - API Routes（如 `api/chat`、`api/generate-images`、`api/distribute-credits`、`api/webhooks/stripe`）普遍遵守统一模式：鉴权 → 限流 → 解析/校验 → 调用 usecase → 统一 envelope / error code。
- **`src/actions`（safe actions）**  
  - 使用 `actionClient` / `userActionClient` / `adminActionClient` + `withActionErrorBoundary` 形成统一模板，actions 主要承担参数校验与上下文注入职责。
  - 个别 admin 查询（如 `get-users`）在 action 内直接访问 drizzle DB，属于「简单读操作」的特例，模式上与 usecase/域服务略有差异（但在当前复杂度下仍可接受）。
- **`src/lib/server` / `src/lib/user-lifecycle`**  
  - `lib/server` 聚合 API auth、logger、rate-limit、error-codes、usecases 等「应用服务 + 基础设施」能力，是路由/API 层的主要入口。  
  - `lib/user-lifecycle` 将注册后积分赠送、newsletter 订阅等副作用从 auth/路由剥离出来，作为「生命周期 orchestrator」，符合单一职责。
- **`src/domain`（billing / membership / plan）**  
  - `billing-service.ts` 承担计费领域服务角色，接口通过 `BillingService` / `BillingRenewalPort` 暴露，依赖 `PaymentProvider` / `CreditsGateway` / `MembershipService` / `PlanPolicy` 等抽象。
  - domain 本身不直接操作 Stripe 或 HTTP，而是通过上层 usecase/API 与底层 payment/credits 协作。
- **`src/credits`**  
  - 按「domain / data-access / services / jobs」分层：领域规则集中在 `CreditLedgerDomainService`，仓储在 `CreditLedgerRepository`，对外 gateway 在 `CreditLedgerService`，分发/过期 job 在 `distribute.ts` / `expiry-job.ts`。
  - 领域不变量（余额不能为负、periodKey 约束、过期处理）集中在 domain 层，应用层只做 orchestration。
- **`src/payment`**  
  - `services` 中通过 `StripePaymentAdapter`、`StripeWebhookHandler`、`stripe-payment-factory` 封装 Stripe 的全部细节，对外以 `PaymentProvider`/webhook handler 形式暴露。
  - `data-access` 封装 payment / stripe_event / user 等表的 CRUD，未向上暴露 Drizzle 细节。
- **`src/ai`**  
  - 将配置与计费 (`ai-config-provider`, `billing-config`) 与用量计数 (`ai-usage-service`) 从具体 usecase 中抽离；文本分析、图片生成各自有清晰的 utils + provider 组织。
  - 与 credits 的关系主要在 usecase 层体现（消耗积分/免费次数），AI domain 本身不直接关心积分细节。

### 三、依赖关系与耦合度

- **整体方向基本正确**  
  - API / actions 大多依赖 `lib/server/usecases` 或领域服务，而不是直接访问 DB 或外部 SDK。  
  - Credits、payment、billing、AI 之间的协作通过接口（`CreditsGateway`、`PaymentProvider`、`BillingRenewalPort`、`PlanCreditsConfig`）而非直接依赖对方内部实现。
- **耦合热点 1：`payment ↔ billing ↔ credits` 三角**  
  - Billing 依赖 `PaymentProvider`（订阅/credits checkout）、`CreditsGateway`（发放积分）、`MembershipService`（终身会员）、`PlanPolicy`。  
  - Payment 在 webhook handler 中通过 `BillingRenewalPort` 回调 billing 完成续费场景的积分和 membership 变更。  
  - Credits 通过 `CreditsGateway` 为 billing/payments 提供统一的积分入口。  
  - 从 DDD 角度看，这是通过端口协作形成的闭环，但在实现上三个模块间的接口和类型散落在不同目录，整体认知难度偏高。
- **耦合热点 2：错误模型与日志模型的全局渗透**  
  - `ErrorCodes` + `DomainError` + `getLogger` 几乎被所有层级使用，包括 domain 层（如 `DefaultBillingService`、`CreditLedgerDomainService`）。  
  - 优点是错误与日志模型高度一致；缺点是 domain 无法在不携带这些实现的情况下复用到别的 runtime（例如浏览器/edge 或独立服务）。
- **耦合热点 3：`src/lib` 根的「杂物间」倾向**  
  - `safe-action.ts`、`domain-error-utils.ts`、`credits-settings.ts`、`price-plan.ts`、`metadata.ts` 等都堆在 `lib` 根，其他模块通过 `@/lib/*` 广泛引用。  
  - 这种扁平布局在规模继续增长时容易形成「一切皆可从 lib 引入」的隐式耦合热点。

### 四、可维护性与演进性（架构视角）

- **新增业务特性**  
  - 对于「只涉及单一域」的特性（例如新的 AI 分析模式或新的 storage 操作），可以按照既有模式：新增 usecase → 暴露 action/API route → UI 通过 hooks/actions 调用，可维护性良好。
  - 对于涉及 `credits + billing + payment` 的特性（如新的计费计划或 credits 赠送规则），需要在多个模块间改动；当前边界是清晰的，但缺少一个集中展示三者合作关系的契约层。
- **替换基础设施实现**  
  - 支付：通过 `PaymentProvider` 抽象 + Stripe 实现，理论上可替换为其他支付服务；但 `PaymentProvider` 的定义位于 payment 模块，billing/domain 对其有直接依赖，未来若拆包需要调整依赖路径。
  - AI Provider：目前 usecase 直接调用 `ai.streamText` 等，增加/替换 provider 还停留在配置层；长远看可以考虑在 usecase 与具体 provider 之间加一层「AIProvider」抽象，但短期完全符合 YAGNI。
- **拆分服务的可行性**  
  - Credits 部分（domain + data-access + services + jobs）边界最清晰，是最适合未来独立成服务的候选；现有 `CreditsGateway` 已经是天然契约。
  - Billing/payment 的拆分需要先收敛契约（见「改进建议」），否则会因为接口散落导致迁移成本较高。

### 五、技术债与结构性风险（架构层）

1. **domain 层直接依赖 `lib/server`（error-codes / logger / getDb 默认实现）**  
   - 原因：为了减少样板代码，直接在 domain 内使用统一错误码和日志实现，并默认使用 `getDb` 获取 DB 连接。  
   - 风险：domain 很难在无 Node 运行时或独立服务中复用；更换日志或错误模型时，影响面大。  
   - 等级：中等，短期可接受，但应作为未来「跨服务/多 runtime」演进前的治理点。
2. **payment / billing / credits 契约分散**  
   - 原因：三个模块分别定义自己关心的接口与类型（`PaymentProvider`、`CreditsGateway`、`BillingRenewalPort`、`PlanCreditsConfig` 等）。  
   - 风险：理解和修改计费相关逻辑需要在多个目录间频繁跳转；缺乏一个「单一可信源」描述三者的协作契约。  
   - 等级：中等偏上，建议纳入中期路线图。
3. **`src/lib` 根逐步演化为高扇入依赖点**  
   - 原因：作为共享工具集自然聚集 cross-cutting concerns。  
   - 风险：随着项目规模扩大，任何模块都能 import `@/lib/*`，使得依赖图更难收敛，增加重构成本。  
   - 等级：中低，可通过命名规范与目录调整渐进缓解。

### 六、架构级改进建议与演进路径（摘要版）

> 以下建议与前文「综合改进建议」互补，聚焦在「模块边界 / 契约 / 依赖方向」三个方面。

1. **收敛错误与日志模型的依赖边界（中期）**  
   - 将 `ErrorCodes` 从 `lib/server` 提升到更中性的 shared 模块；为 domain 层注入 logger（构造函数参数），而不是在内部直接调用 `getLogger`，降低对 infra 的静态依赖。
2. **为 payment/billing/credits 建立显式「契约层」（中期）**  
   - 新增一个 contracts 子模块，集中定义跨域接口与 DTO（`PaymentProvider`、`CreditsGateway`、`BillingRenewalPort`、`PlanCreditsConfig` 等），并在 docs 中配套「协作契约」说明，降低认知成本。
3. **整理 `src/lib` 结构，区分 foundation vs domain-adapter（中期）**  
   - 将 `safe-action`、`domain-errors`、`logger` 等基础能力归类为 foundation；将与具体领域相关的配置（如 credits/price-plan/metadata）分组到 domain-adapter 子目录，避免「所有东西都在 lib 根」的扩散。
4. **在文档层固化 actions/usecase 的边界约定（短期）**  
   - 明确约定：复杂业务流程（尤其涉及 credits/billing/payment/AI 的）必须通过 usecase/领域服务暴露；actions 直接访问 DB 仅限简单查询。将该约定写入 `docs/developer-guide.md` 和 review checklist。
5. **补充一张「credits/billing/payment 协作关系图」（短期）**  
   - 在 `docs/credits-lifecycle.md` 或 `docs/payment-lifecycle.md` 中新增“Contracts & Ports”小节，用文字或示意图方式展示三者之间的调用和依赖方向，降低心智负担。
