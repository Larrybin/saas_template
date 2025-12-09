# 协议 / 未来演进 / 技术债 审查报告（2025-12 版本）

> 目标：基于当前仓库实现（代码 / 配置 / 脚本 / 文档），重新梳理协议层面的一致性与未来演进能力，并给出最新的 Top 技术债矩阵。  
> 本版本完全替换旧版报告内容，以本文件为协议和技术债的**单一事实来源**。

---

## 当前工作流（2025-12-09）

- **任务**：依据 `.codex/rules/api-protocol-and-error-codes-best-practices.md` 对仓库所有 API route 及错误码实现进行静态审查，并输出专项报告（`reports/`）。
- **范围**：
  1. 代码：`src/app/api/**`, `src/lib/server/error-codes.ts`, `src/lib/domain-error-utils.ts`, `src/lib/server/domain-errors/**` 等；
  2. 文档：`docs/error-codes.md`, `docs/error-logging.md`, `docs/api-reference.md`, `.codex/plan/*` 中相关约定；
  3. 辅助配置/脚本：`scripts/check-protocol-and-errors.ts`, `package.json` 中的 protocol 工具。
- **计划**：
  1. 建立全量路由与错误码清单，标注特例（webhook、健康检查、流式接口等）；
  2. 逐项比对 envelope 结构、DomainError 映射、HTTP 状态、错误码分层及文档同步情况，记录问题与证据；
  3. 汇总发现，形成 `reports/protocol-future-techdebt-report.md`，并给出修复建议 / 关联技术债条目。

---

## 0. 更新说明与状态标记

- 本版已显式对每个技术债条目标记**当前状态**：
  - `✅ 已落地`：核心能力已在代码/脚本中实现，后续仅需例行维护或小幅演进；
  - `♻️ 部分落地`：基础设施已就位，但仍有明显收尾/扩展工作；
  - `⏳ 未落地`：尚无统一实现，仅存在零散约定或 TODO。
- 相比旧版，本版特别反映以下变化：
  - `scripts/check-protocol-and-errors.ts` 已提供 API Envelope、Server Actions、安全包装、错误码文档 & UI registry 的静态守护，并通过 `pnpm check:protocol` 暴露；
  - AI 计费 (`AiBillingPolicy`) 已支持按 `planId` / `region` 覆盖规则；
  - 支付 Provider 工厂 (`DefaultPaymentProviderFactory`) 已支持 `stripe` 与 `creem` 双 Provider；
  - Storage 错误 UI 已由 `useStorageErrorUi` + `domain-error-ui-registry` 覆盖，并有测试支撑；
  - `docs/governance-index.md` 已作为 `.codex/plan/*` 报告/计划的治理入口；
  - 订阅续费 → Payment 账本 → Credits 发放链路已通过 usecase `processSubscriptionRenewalWithCredits` 收口，并由 Stripe Webhook 调用，简化了 Membership/Payment/Credits 之间的协作边界；
  - AI Chat / 文本分析 / 图片生成在 marketing 入口页已通过统一的 `AiBillingHint` 组件和 `AIBilling`/`AIErrors` i18n key 表达「免费额度 vs 积分扣费」规则。

---

## 1. 协议地图（Protocol Map）

本节只保留对后文技术债矩阵有直接依赖的协议轮廓，详细调用链请参考：

- `docs/api-reference.md`
- `docs/error-logging.md`
- `docs/error-codes.md`
- `docs/credits-lifecycle.md`
- `docs/payment-lifecycle.md`
- `docs/ai-lifecycle.md`
- `docs/storage-lifecycle.md`

### 1.1 外部协议：HTTP API / Server Actions / Job / Webhook

- **统一 Envelope 与错误模型**
  - 除流式 `POST /api/chat` 外，HTTP API 建议统一使用：
    - 成功：`{ success: true, data: {...}, ... }`
    - 失败：`{ success: false, error, code?, retryable? }`
  - 业务错误统一通过 `DomainError` 子类 + `ErrorCodes` 暴露（日志 & 前端 UI 共用）。
  - 协议规范来源：`docs/api-reference.md` + `docs/error-logging.md` + `docs/error-codes.md`。

- **Server Actions（safe-action）**
  - 所有 `src/actions/*` 通过 `createSafeActionClient` 创建，并统一在 `handleServerError` 中包装 `DomainError` / 其它错误；
  - 通过 `withActionErrorBoundary` helper 统一 `.action(...)` 的日志与错误 envelope 模板；
  - 静态守护由 `scripts/check-protocol-and-errors.ts` 中 `checkSafeActions` / `checkActionsUseErrorBoundary` / `checkActionErrorEnvelopes` 提供。

- **Job / Cron**
  - 代表：`/api/distribute-credits` 作为积分分发 Job HTTP 入口；
  - 使用 Basic Auth + JSON Envelope，错误码例如 `CRON_BASIC_AUTH_MISCONFIGURED` / `CREDITS_DISTRIBUTION_FAILED`；
  - 详细说明见 `docs/credits-lifecycle.md` + `docs/env-and-ops.md`。

- **Webhook**
  - `POST /api/webhooks/stripe`
    - 通过 `handleStripeWebhook` 验证签名并调度 `StripeWebhookHandler`；
    - `DomainError` 分支根据 `retryable` 和特定错误码（如 `PAYMENT_SECURITY_VIOLATION`）映射状态码；
    - 非 `DomainError` 分支当前固定返回 `{ retryable: true, code: UNEXPECTED_ERROR, status: 400 }`。
  - Creem Webhook 相关协议见 `docs/payment-lifecycle.md` 与 `.codex/plan/creem-*`。

### 1.2 内部协议：Domain / Service / Hooks / UI

- **Credits / Payment / Billing 组合**
  - Credits 由 `CreditLedgerDomainService` + `CreditLedgerService` 提供稳定接口；
  - Payment 使用 `PaymentProviderFactory` 在 `stripe` / `creem` 之间切换；
  - Billing 负责 Plan / 订阅续费 / 终身会员等组合根。

- **AI 调用与计费**
  - `execute-ai-chat-with-billing` 等 usecase 负责「免费额度 → 积分扣费 → AI Provider 调用」链路；
  - AI 计费规则通过 `AiBillingPolicy` + `AiConfigProvider` 从 `websiteConfig.ai.billing` 获取，并支持按 `planId` / `region` 选择 override；
  - UI 通过 `useAiErrorUi` + error UI registry 消费错误码。

- **Storage 错误模型与 UI**
  - 后端：`/api/storage/upload` 等路由统一返回 `STORAGE_*` 错误码；
  - 前端：`useStorageErrorUi` + `domain-error-ui-registry` 中的 `STORAGE_*` 策略统一 toast 行为与 fallback 文案；
  - 规范见 `docs/storage-lifecycle.md` + `docs/error-logging.md`。

---

## 2. 未来演进关键场景（简要）

本报告优先关注三个中长期演进方向：

1. **多 Provider / 多租户 / 多 Region**
   - Payment：`DefaultPaymentProviderFactory` 已支持 `stripe` + `creem`，但多租户/多 Region wiring 仍需在 PaymentContext & Billing 组合根层面演进；
   - Storage / AI：未来可能引入更多 Provider，需要在 config/provider 层收口。
2. **AI 计费与 Credits / Billing 的深度对齐**
   - 将 `AiBillingPolicy` 中的 plan/region 维度与 Billing PlanPolicy 对齐；
   - 在文档与错误模型上统一展示免费额度与付费额度。
3. **协议可观测性与自动守护**
   - 通过脚本/CI 统一守护：Envelope、错误码、span 与文档映射；
   - 提供 env/config → 协议行为的集中映射，降低错误配置导致的协议偏差风险。

---

## 3. 技术债矩阵（Top ~20）

> 聚焦对「协议一致性 + 未来演进能力」影响最大的技术债项，按照 P0/P1/P2 粗略排序，并给出人日级估算。  
> **状态列**反映当前实现程度：
> - `✅ 已落地`：首版已在代码/脚本中实现；
> - `♻️ 部分落地`：基础设施已存在，但仍有明显收尾；
> - `⏳ 未落地`：尚无统一实现。

| # | 领域/维度 | 问题描述 | 证据 | 优先级 | 估算 | 状态 | 备注 |
| - | -------- | -------- | ---- | ------ | ---- | ---- | ---- |
| 1 | 协议一致性 / API | 新增 `/api/*` 路由缺少自动化 Envelope 校验，依赖人工 review | `docs/error-logging.md` 仅给出模式示例；`src/app/api/*` 中 Envelope 实现依靠手写 | P1 | 2d | ✅ 已落地 | 已通过 `scripts/check-protocol-and-errors.ts` → `checkApiEnvelopes` 实现静态守护（扫描使用 `NextResponse.json` 的 route 是否设置 `success` 字段），并由 `pnpm check:protocol` 暴露；如需更精细的 per-call 检查可作为后续 P2 子任务。 |
| 2 | 协议一致性 / Actions | safe-action 规范缺少静态守护，新 Actions 可能绕过 DomainError 模型 | `src/actions/*` 当前已统一，但旧版仅文档约束 | P1 | 1.5d | ✅ 已落地 | 通过 `checkSafeActions` 强制引入 `@/lib/safe-action`，`checkActionsUseErrorBoundary` 保证 `.action(...)` 包裹 `withActionErrorBoundary`，`checkActionErrorEnvelopes` 对 `{ success: false }` 无 `code` 的情况给出 warning；`src/lib/safe-action.ts` 提供 helper 并已迁移 Credits/Billing/Newsletter 等关键 Actions。 |
| 3 | API ↔ 文档 对齐 | 部分 API/Job 未在 `docs/api-reference.md`/`docs/env-and-ops.md` 完整登记 | 对比 `src/app/api/*` 与 docs 章节存在遗漏 | P1 | 1.5d | ♻️ 部分落地 | 已在 `scripts/check-protocol-and-errors.ts` 中新增 `checkApiDocsReferences`，自动扫描 `src/app/api/*` 下的 route，并与 `docs/api-reference.md` 中列出的 `/api/*` 进行比对，缺失项以 warning 形式输出；仍需在补文档时人工确认，但新增 API 已有轻量级自动守护。 |
| 4 | ErrorCodes ↔ 文档/前端 映射 | ErrorCodes 中部分码在 docs 或前端 registry 中缺少对应条目，影响观测与 UI 一致性 | `src/lib/server/error-codes.ts` vs `docs/error-codes.md` vs `src/lib/domain-error-ui-registry.ts` | P1 | 2d | ✅ 已落地 | `checkErrorCodesDocumented` 保证所有错误码在 `docs/error-codes.md` 中登记，`checkErrorUiRegistry` 保证 UI registry 不引用不存在的码，`checkDomainErrorCodes` 校验 `DomainError` 子类引用的 `ErrorCodes.*` 均存在；均集成进 `pnpm check:protocol`。 |
| 5 | AI 计费配置缺少 plan/region 维度的端到端对齐 | AI 计费规则虽已支持按 `planId`/`region` override，但与 Billing PlanPolicy 的上下文对齐仍靠约定 | `src/ai/billing-policy.ts` + `src/ai/ai-config-provider.ts` + `docs/ai-lifecycle.md` | P1 | 2d | ♻️ 部分落地 | `AiBillingPolicy` 已支持从 `AiBillingContext`（含 `planId`/`region`）选择 override，基础能力就绪；下一步主要是在调用方/PlanPolicy 层统一上下文来源，而非新增复杂规则仓库，以避免过度工程。 |
| 6 | Payment 多 Provider / 多租户 支撑不足 | `PaymentProviderFactory` 已引入，但多 Provider wiring 与多租户/多 Region 场景尚未完全固化 | `docs/payment-lifecycle.md` + `src/payment/provider-factory.ts` + `src/payment/services/*` | P1 | 3d | ♻️ 部分落地 | `DefaultPaymentProviderFactory` 已支持 `stripe` + `creem`，并从 `serverEnv` 读取配置；但 Billing 组合根、多租户/多 Region wiring 仍主要通过单实例 factory 实现。建议在真实需求出现时渐进扩展 `PaymentContext`，而非预先实现复杂多租户路由。 |
| 7 | Credits 过期/来源 策略配置的集中声明 | Credits 过期/优先级策略分散在领域常量与配置解析中，缺少统一「来源 → 规则」声明 | `docs/credits-lifecycle.md` + `src/credits/config.ts` + `src/credits/domain/*` | P2 | 3d | ⏳ 未落地 | 目前主要通过 `websiteConfig.credits` + `PricePlan` 配置与领域逻辑组合实现，缺乏一处清晰的「来源类型 → 过期/消费规则」表。建议在现有 `credits/config.ts` 上做轻量收口，而非构造通用规则引擎。 |
| 8 | 运维/客服人工调整流程协议缺失 | 人工加减积分/修正账本流程未在 API & 审计层固化统一协议 | `docs/credits-lifecycle.md` 提及但未细化；缺少专用 admin API/Actions | P2 | 2d | ✅ 已落地 | 已通过 `src/lib/server/usecases/adjust-user-credits.ts`（usecase）与 `src/actions/adjust-user-credits.ts`（基于 `adminActionClient` 的安全入口）实现最小可用的人工调账通道，并在 `docs/credits-lifecycle.md` 中补充了调用链与审计日志说明。 |
| 9 | Docs/Marketing Source baseUrl TODO 未关闭 | `pagesSource` baseUrl TODO 仍存在，反映 docs/marketing 路由契约不稳定 | `src/lib/source.ts` | P2 | 1d | ♻️ 部分落地 | `pagesSource` 实际已使用 `baseUrl: '/pages'`，但注释仍保留 TODO，且文档中缺少统一说明。建议更新注释与 `docs` 中说明，将 `/pages` 固化为约定前缀，并酌情增加 1–2 个 e2e 验证。 |
| 10 | 文档 Source 与路由映射缺乏集中声明 | Fumadocs Source key 与实际路由前缀关系散落在实现中 | `source.config.ts` + `src/lib/source.ts` + `src/app/docs/*` | P2 | 1.5d | ♻️ 部分落地 | 已在 `docs/architecture-overview.md` 中新增「Docs / Marketing / Blog Source ↔ Route 映射」表，并在 `src/lib/source.ts` 中固定各 Source 的 `baseUrl`；未来若调整 docs/marketing/blog 路由前缀，仅需同步更新该表和 Source 配置，必要时再按需补充极少量 e2e 校验。 |
| 11 | 协议与错误模型缺少统一 CI 级守护 | Envelope/错误码/spans 过去主要靠人工检查 | `docs/error-logging.md` + `package.json` + CI 配置 | P1 | 2d | ✅ 已落地 | `pnpm check:protocol` 集成了 API Envelope、Server Actions、安全包装、错误码文档 & UI registry 等静态守护；若 CI 尚未执行该脚本，则需在流水线中接入即可，无需额外基础设施。后续扩展 span 检查见 #12。 |
| 11a | Stripe webhook UnexpectedError 的 HTTP 状态与 retryable 语义不完全一致 | 非 DomainError 分支返回 `retryable: true` 但 HTTP 状态固定 400 | `src/app/api/webhooks/stripe/route.ts` + `docs/error-logging.md` | P2 | 1d | ✅ 已落地 | `/api/webhooks/stripe` 的非 DomainError 分支现已返回 500 + `{ code: UNEXPECTED_ERROR, retryable: true }`，与「可重试＝5xx」约定对齐；对应行为在测试与文档中已更新。 |
| 11b | Credits 套餐 webhook 对缺失 metadata 静默处理 | `onCreditPurchase` 在 `userId/packageId/credits` 缺失时直接 return 且不记录日志 | `src/payment/services/webhook-handler.ts` + `docs/credits-lifecycle.md` | P1 | 2d | ✅ 已落地 | `onCreditPurchase` 现在会在缺少 `userId/packageId/credits` 时记录 error 级日志（含 sessionId/metadata），并抛出 `InvalidCreditPayloadError(CREDITS_INVALID_PAYLOAD)`，不再静默吞掉该类错误；相关行为已由测试覆盖。 |
| 11c | Webhook 入口对「缺 payload/signature」未记录结构化日志 | `/api/webhooks/stripe` 在缺少 payload/signature 时直接返回 400 + `UNEXPECTED_ERROR`，无日志记录 | `src/app/api/webhooks/stripe/route.ts` | P2 | 1d | ✅ 已落地 | `/api/webhooks/stripe` 在缺少 payload/signature 时现会记录结构化错误日志（含 `reason` 字段），并使用 `PAYMENT_SECURITY_VIOLATION` 错误码返回 400（`retryable: false`），以明确区分安全配置问题；详细行为见 `docs/payment-lifecycle.md`。 |
| 12 | Error Logging 文档中的 span 表与实际使用可能漂移 | `docs/error-logging.md` 中 span 汇总表需手动维护 | `docs/error-logging.md` vs `src/lib/server/logger.ts` + 调用点 | P2 | 1.5d | ♻️ 部分落地 | 已在 `scripts/check-protocol-and-errors.ts` 中新增 `checkSpansDocumented`，从源码中收集 `span: '...'` 字段并与 `docs/error-logging.md` 表格中的 span 做双向 diff，对缺失/多余项给出 warning，辅助人工维护文档；如需提升为更强约束，可在未来按需收紧为 error。 |
| 13 | Membership/Payment/Credits 调用链复杂度偏高 | 终身会员、订阅续费、Credits 发放依赖多个组合根与仓储，阅读成本较大 | `docs/credits-lifecycle.md` + `docs/payment-lifecycle.md` + 源码 | P2 | 3d | ♻️ 部分落地 | 已在 usecases 层新增 `processSubscriptionRenewalWithCredits`（`src/lib/server/usecases/process-subscription-renewal-with-credits.ts`），并由 `StripeWebhookHandler` 调用，将「Stripe 订阅续费 → Payment 账本记录 → Billing.handleRenewal → Credits 发放」收口为单一事务性编排点；同时补充 `webhook-handler-subscription.test.ts` 覆盖 created/updated 续费路径。Lifetime 购买仍通过 `DefaultBillingService.grantLifetimePlan` 协调 Credits 与 Membership，后续如有新增 Provider/场景再视需要追加 usecase，而非预先抽象统一规则引擎。 |
| 14 | Storage 错误模型与前端 UI 一致性依赖手动维护 | 旧版主要靠约定，缺少集中 UI 策略与测试 | `docs/storage-lifecycle.md` + `src/hooks/use-storage-error-ui.ts` + `src/lib/domain-error-ui-registry.ts` | P2 | 1.5d | ✅ 已落地 | `useStorageErrorUi` + `domain-error-ui-registry` 中的 `STORAGE_*` 策略已为 Storage 提供统一错误 UI 行为，并有对应测试用例。后续只需在新增错误码时保持 ErrorCodes/Docs/UI registry 一致，无需再引入新 UI 机制。 |
| 15 | ErrorCodes 扩展策略缺少可执行 checklist | 新领域引入错误码的命名/分类/文档流程没有具体检查清单 | `docs/error-codes.md` + `.codex/plan/error-codes-expansion.md` | P2 | 1d | ✅ 已落地 | `.codex/plan/error-codes-expansion.md` 已补充「错误码变更 checklist」，并在 `.github/pull_request_template.md` 中新增对应勾选项，明确约束新增/修改错误码时同步更新 `ErrorCodes`、相关 docs 与本报告/plan 文档；后续只需遵循该 checklist 执行即可。 |
| 16 | tests 覆盖协议边界仍不均衡 | 部分关键协议（Job/API/Webhook）缺少最小 route/e2e 级回归测试 | `docs/testing-strategy.md` + 测试目录 | P2 | 3d | ⏳ 未落地 | 已有大量 usecase/route 级测试及部分 e2e，但覆盖重点仍不均衡。建议按本矩阵列出的高风险协议（Webhook、Credits Job、AI 调用等）优先补齐少量高价值用例，而非追求全面铺开。 |
| 17 | Credits 分发 Job 失败路径的监控与报警未闭环 | 错误码存在，但从日志到报警与重试策略仍依赖人工经验 | `docs/credits-lifecycle.md` + `docs/error-logging.md` | P2 | 2d | ♻️ 部分落地 | 已在 `docs/credits-lifecycle.md` 中补充基于 `span = api.credits.distribute` 与错误码（如 `CRON_BASIC_AUTH_MISCONFIGURED`、`CREDITS_DISTRIBUTION_FAILED`）的报警建议，但具体监控/告警配置仍需在部署环境中完成。 |
| 18 | AI 免费额度与付费额度的 UI 表达尚未统一 | 前端对「免费额度 vs 积分扣费」的展示与文案分散 | `docs/ai-lifecycle.md` + UI 源码 | P2 | 2d | ♻️ 部分落地 | 已在 marketing AI 入口页（Chat/Text/Image）通过 `AiBillingHint` 组件（`src/components/shared/ai-billing-hint.tsx`）和 `AIBilling`/`AIErrors` i18n key 统一了「本功能有免费调用额度，超出后按积分扣费」的提示文案及 AI 错误 toast 标题；后续如需展示 per-user 剩余免费次数，可再按需新增轻量 status API/Hook，而无需改动当前计费引擎。 |
| 19 | env/config 与协议行为的耦合点文档化不充分 | 部分行为对 env/config 高度敏感，但映射关系散落各文档 | `docs/env-and-ops.md` + 各 lifecycle 文档 | P2 | 2d | ♻️ 部分落地 | `docs/env-and-ops.md` 中已提供集中「Env ↔ 协议/API ↔ 错误码」映射表，覆盖 Stripe/Creem Webhook、Cron Basic Auth、Storage、AI Provider 等关键路径；本轮进一步修正了 Creem 行的错误码描述，使之与 `CREEM_PROVIDER_MISCONFIGURED` 保持一致。后续如有新增敏感 env，只需按同一表格格式追加条目并在对应 lifecycle 文档中补充细节。 |
| 20 | 协议/技术债报告与 `.codex/plan` 同步机制依赖人工 | 报告与 plan 文档之间的一致性缺少流程级约束 | `docs/governance-index.md` + `.codex/plan/*` | P2 | 1d | ♻️ 部分落地 | `docs/governance-index.md` 已提供统一入口并索引本报告，但 PR 流程中尚无硬性检查。建议在 PR 模板中加入简短 checklist（如「是否需要更新 `.codex/plan` / `docs/error-codes.md` / `docs/error-logging.md` / `docs/api-reference.md` 等」）。 |

> 优先级定义：P0（立即影响线上）、P1（短期需修复）、P2（中期优化项）。估算为粗略人日，仅用于排序与容量规划。

---

## 4. 建议与下一步（基于最新状态）

结合以上协议地图与技术债矩阵，建议按以下顺序推进：

1. **巩固已落地的自动化守护（持续性工作）**
   - 继续在 CI 中强制执行 `pnpm check:protocol`，将 #1/#2/#4/#11 的静态守护作为新增 API/Actions 的「红线」；
   - 在评审新协议/错误模型时，优先通过扩展脚本与 docs，而不是在各处追加本地检查逻辑。

2. **围绕已收口链路做精细化补全（中短期 P1-P2）**
   - 在 Stripe Webhook + Billing + Credits 已通过 usecase 收口的基础上，补齐少量针对续费/一次性购买/人工调账路径的高价值测试，用于逐步消化 #16；
   - 视真实需求评估是否需要为 Lifetime 购买再抽象一个轻量 usecase，而不是预先构建统一规则引擎（继续避免触发 #5/#7 的过度工程）。

3. **中期优化：协议映射、env 映射与可观测性（P2）**
   - 依托 `checkApiDocsReferences` (#3)、Docs / Marketing / Blog Source ↔ Route 映射表与 env ↔ 协议行为映射表（#9/#10/#19），持续补齐文档与脚本输出中的缺口，减少「看代码才能知道行为」的情况；
   - 结合 Credits 分发 Job / Webhook / AI 路由的 span 与错误码，为 #17 设计一组最小可用的监控与告警规则（由部署环境承接）。

4. **持续治理：报告 / 计划 / 实现三者同步（#14/#18/#20）**
   - 在新增错误码、扩展 AI/Payment/Credits 能力或调整计费策略时，同时更新 `docs/*-lifecycle.md`、`docs/error-codes.md`、本报告和对应 `.codex/plan`，并通过 PR 模板 checklist 明确这一要求；
   - 定期（例如每季度）回顾本矩阵，根据 #13/#18 等条目的最新落地情况调整状态与优先级，避免报告与实现再次漂移。 
