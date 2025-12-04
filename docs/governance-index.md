# 治理索引（Architecture & Governance Index）

> 目标：为团队提供一个单一入口，快速定位当前仓库的架构审查、协议与技术债报告文档。代码层面的详细分析仍以各自报告为准。

## 1. 架构与代码质量报告

- **仓库架构体检：可维护性 / 复用性 / 耦合度 / 测试支撑**  
  - 报告：`.codex/plan/repo-architecture-review-maintainability-reuse-coupling-report.md`  
  - 说明：从全局角度评估当前代码的可维护性、复用性、耦合度和测试支撑情况，并给出按 P0/P1/P2 排序的架构改进建议和影响范围矩阵。
  - 配套计划：`.codex/plan/repo-architecture-review-maintainability-reuse-coupling.md`

- **协议 / 未来演进 / 技术债 审查报告**  
  - 报告：`.codex/plan/protocol-future-techdebt-report.md`  
  - 说明：聚焦 API 协议、一致性、未来演进能力以及技术债量化（优先级 + 人天估算），是协议层和错误码的“单一事实来源”。
  - 配套计划：`.codex/plan/protocol-future-techdebt.md`

- **补充架构巡检 / 代码审核任务**  
  - 计划：`.codex/plan/project-architecture-review.md`、`.codex/plan/repo-architecture-review.md`、`.codex/plan/repo-review-protocol-future-techdebt.md`、`.codex/plan/结构化代码审核.md`、`.codex/plan/架构评估.md`、`.codex/plan/项目架构评审复核.md`。  
  - 说明：为全局架构/协议复核、静态分析与基线巡检提供补充入口，结合上述两份报告持续跟踪整改进度。

## 2. 使用建议

- 进行「协议 / 错误码 / Envelope 变更」时：  
  - 先查阅 `protocol-future-techdebt-report.md`，确认现有约定与技术债项；  
  - 若改动影响架构边界（如 credits/billing/payment/AI 的分层），再参考 `repo-architecture-review-maintainability-reuse-coupling-report.md` 中的相关建议与影响矩阵。

- 规划中长期重构或大规模重组模块时：  
  - 以本索引为入口，结合上述两份报告的 P0/P1/P2 建议拆分具体任务，必要时在 `.codex/plan` 下新增对应的细化 plan 文档，保持“plan ↔ report ↔ 实际改动”三者同步。

## 3. 协议 / 错误模型 / Envelope 治理索引

> 聚焦统一错误模型、Envelope、内部任务与领域错误码治理的专题计划/报告。

- **统一 API Envelope 与错误模型**  
  - 计划：`.codex/plan/unify-api-envelope-and-errors.md`  
  - 说明：梳理并统一 API / Actions 的 Envelope 结构与错误处理路径，为 `docs/error-logging.md`、`docs/error-codes.md` 等文档提供实现侧依据。

- **Credits + Envelope 协调**  
  - 计划：`.codex/plan/api-error-envelope-and-credits-lifecycle.md`  
  - 说明：对齐积分生命周期（`docs/credits-lifecycle.md`）与 API Envelope 的边界，为 Credits 相关 API 的错误模型提供细化约束。

- **错误码扩展与内部任务错误治理**  
  - 计划：`.codex/plan/error-codes-expansion.md`、`.codex/plan/internal-job-and-error-codes.md`  
  - 说明：系统性扩展错误码空间，并规范内部 Cron / Job（如积分分发、过期任务）的错误码使用方式，与 `ErrorCodes` 常量表保持同步。

- **Server Actions / Storage 等领域错误统一**  
  - 计划：`.codex/plan/server-actions-domain-error-unification.md`、`.codex/plan/storage-client-domain-error-fix.md`  
  - 说明：确保 Server Actions、存储客户端等边界模块统一使用 DomainError / Envelope 模式暴露错误，避免“裸 throw/Error” 泄漏实现细节。

- **Cron / Basic Auth Envelope 收口**  
  - 计划：`.codex/plan/fix-distribute-credits-401-envelope.md`  
  - 说明：将 `/api/distribute-credits` 的 200/401/5xx 全量统一为 JSON envelope，区分凭证错误与 env 缺失，并同步 `docs/api-reference.md`、`docs/error-codes.md`、`.codex/rules/api-protocol-and-error-codes-best-practices.md`。

- **协议 / 错误模型静态守护（check:protocol）**  
  - 脚本：`scripts/check-protocol-and-errors.ts`，命令：`pnpm check:protocol`。  
  - 说明：扫描 `/api/*` 与 `src/actions/*` 的 Envelope 使用、错误码文档同步以及 DomainError/错误 UI 注册表的一致性，是协议与错误模型的基础守门人。  
  - 建议：在 CI pipeline 中将 `pnpm check:protocol` 与 `pnpm lint` / `pnpm test` 一同执行，防止新增 API / Actions / ErrorCodes 时偏离约定；当脚本新增检查项时，应同步更新相关 plan/report 文档中的说明。

## 4. 领域专题治理计划索引

> 按领域聚合与架构/协议紧密相关的 plan/report，作为深入治理某一域时的入口。

- **Credits / Billing / Payment 领域**  
  - 积分 & 计费策略：`.codex/plan/plan-credits-and-current-plan.md`、`.codex/plan/plan-credits-billing-tests.md`、`.codex/plan/credits-gateway-decoupling.md`、`.codex/plan/billing-credits-config-and-error-ui-refactor.md`。  
  - 支付 / 会员架构：`.codex/plan/payment-hexagonal-refactor.md`、`.codex/plan/billing-membership-decoupling-and-stripe-factory-refactor.md`、`.codex/plan/subscription-tx.md`、`.codex/plan/stripe-payment-service-refactor.md`、`.codex/plan/stripe-payment-service-di-refactor.md`、`.codex/plan/membership-domain-service.md`。  
  - 分发与账本演进：`.codex/plan/credit-distribution-stage-b.md`、`.codex/plan/credits-distribute-refactor.md`、`.codex/plan/ledger-domain-stage-a.md`、`.codex/plan/webhook-credit-hardening.md`、`.codex/plan/credit-checkout-price-hardening.md`。

- **AI / 文本分析 / 计费策略**  
  - AI 计费与策略：`.codex/plan/ai-billing-policy-refactor.md`。  
  - 文本分析链路：`.codex/plan/analyze-content-optimization.md`、`.codex/plan/analyze-content-refactor.md`、`.codex/plan/ai-request-validation.md`。  
  - 这些计划与 `docs/ai-lifecycle.md`、`docs/env-and-ops.md` 协同演进，定义 AI → Credits → Billing 的边界。

- **基础设施 / 观测性 / 运行时安全**  
  - 日志与可观测性：`.codex/plan/pino-logging-feasibility.md`、`.codex/plan/frontend-server-request-optimization.md`。  
  - Env / 外部服务兜底：`.codex/plan/Firecrawl配置兜底.md`、`.codex/plan/RateLimit兜底.md`、`.codex/plan/MigrationsJournal修复.md`。  
  - 类型与依赖健康：`.codex/plan/strict-ts-domain-hardening.md`、`.codex/plan/dependency-audit.md`、`.codex/plan/testing-coverage-and-testability-upgrade.md`。

- **文档与流程治理**  
  - 文档体系：`.codex/plan/docs-audit.md`、`.codex/plan/documentation-audit.md`、`.codex/plan/fumadocs-ui-i18n-fix.md`。  
  - 生命周期与钩子：`.codex/plan/lifecycle-hooks-sequential.md`、`.codex/plan/auth-lifecycle-decoupling.md`。  
  - 这些计划与 `docs/developer-guide.md`、`docs/architecture-overview.md` 一起，约束“改代码要配齐哪些文档与流程”的工作流。

## 5. 核心设计 / 运行文档

- `docs/api-reference.md`：当前 API / Actions 的权威参考，包含鉴权方式、Envelope 结构与错误码示例。  
- `docs/feature-modules.md`：以特性模块视角梳理 UI → Actions/API → 领域服务 → 基础设施的调用关系。  
- `docs/payment-lifecycle.md`：Payment/Billing/Stripe Webhook 与 Credits 的边界说明，覆盖 `StripePaymentAdapter` 组合根。  
- `docs/storage-lifecycle.md`：存储上传/下载/鉴权路径的职责划分，配合 `storage-client-domain-error-fix` 等计划使用。  
- `docs/testing-strategy.md`：测试金字塔与主要命令，衔接 `.codex/plan/testing-coverage-and-testability-upgrade.md`。  
- `docs/period-key-operations.md`：周期性密钥与上线操作指南，约束运维侧的安全基线。
- `AGENTS.md`：根目录与各级子目录均已放置同版指引文件，确保在任意目录都能快速查阅仓库约定与操作规则。

## 6. 规则与 Best Practices 文档

除了 `.codex/plan` 下的计划与报告外，仓库还通过 `.codex/rules/*.md` 提供跨领域的规则与最佳实践（如错误处理、AI 降级、安全、存储、测试策略等）：

- 当进行架构、协议或领域规则调整时：  
  - 优先以本索引中的报告（第 1–5 节）为“当前状态 + 变更路线”的依据；  
  - 同时在 `.codex/rules` 中查找对应主题的 `*-best-practices.md`，在不与项目文档冲突的前提下视为默认应遵守的约束。

- 若新增了重要的跨领域约定（例如新的错误模型、Env 策略或多租户隔离规则）：  
  - 建议同时更新：
    - 与之关联的 plan/report（`.codex/plan`）；  
    - 对应的规则文档（`.codex/rules`）；  
    - 以及领域文档（如 `docs/*-lifecycle.md`、`docs/error-codes.md`、`docs/error-logging.md`），保持三者同步。
