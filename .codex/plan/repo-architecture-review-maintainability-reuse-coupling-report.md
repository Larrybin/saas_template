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

1. **全局配置对象读写点相对分散**  
   - 示例：`src/payment/index.ts` 依赖 `websiteConfig.payment` + `serverEnv`；`src/ai/billing-config.ts` 依赖配置与 env；mail 测试直接修改 `websiteConfig.mail`。  
   - 风险：当前用法集中且可控，但随着多租户、环境切分或配置演进，散落的读写点会放大维护成本。

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

1. **抽象 AI 计费策略注入接口**  
   - 目标：让 chat/analyze/generate 等 usecase 依赖 `AiBillingRuleProvider` 而非直接调用配置函数，为 per-plan/per-tenant 策略演进预留空间（协议与计费规则侧的细化建议见 `.codex/plan/protocol-future-techdebt-report.md` 技术债 #5）。
2. **建立关键 UI 流程的最小测试基线**  
   - 目标：为定价页 CTA、AI playground 等高风险 UI 增加少量组件/集成测试，降低重构和样式调整带来的行为回归风险。

### P1（中优）

1. **收敛 action 层错误处理模式**  
   - 在 `safe-action` 或相邻模块提供统一的 DomainError 包装 helper，减少重复 try/catch，统一日志与错误码行为（对应协议层技术债 #2）。
2. **为 payment / AI / mail 引入轻量级配置 provider**  
   - 将 `websiteConfig` / `serverEnv` 的读取集中在少数 adapter，业务代码依赖 `PaymentConfigProvider`、`AiBillingConfigProvider`、`MailConfigProvider` 等抽象（与协议层技术债 #5/#6 联动）。

### P2（低优）

1. **逐步扩展 UI 与 hooks 的测试覆盖**  
   - 从错误 UI hooks、高复用 UI 组件开始，逐步提高前端可测性。
2. **扩展 E2E 覆盖更多业务闭环**  
   - 在已有 auth 与 credits+AI 流程基础上，逐步引入支付/存储等闭环测试，为中长期演进提供回归保障。
