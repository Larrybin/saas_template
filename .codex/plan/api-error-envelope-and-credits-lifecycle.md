# 高优先级重构计划：API 错误模型收敛 & Credits 生命周期文档

## 一、背景与目标

- 背景：
  - `docs/error-logging.md` 已定义推荐的 API 错误处理与日志模型（`DomainError` + `{ success, error, code, retryable }` envelope），但当前 `src/app/api/**/*` 仍可能存在历史风格与局部偏差。
  - Credits / Billing / AI 相关实现较为复杂，虽有 `docs/feature-modules.md` 和 `docs/period-key-operations.md`，但缺少一份专门面向“Credits 生命周期与边界”的设计文档，供新成员快速建立全局心智模型。
- 本轮目标（P0）：
  1. 对 `/api/*` 路由进行一次系统性“错误模型收敛”，统一对外错误响应结构，并与 `ErrorCodes` / `DomainError` 约定对齐。
  2. 新增一份 `docs/credits-lifecycle.md` 文档，完整描述 Credits 生命周期、边界与与 Billing/Payment/Usecases 的交互关系。
- 约束：
  - 不改变对外 HTTP API 的路径、方法、状态码与错误 `code` 字符串值。
  - 不在本轮引入新的领域行为，仅重构错误处理路径与补充文档。

### 与现有错误码相关计划的关系

- 本计划建立在以下两份计划的基础之上：
  - `.codex/plan/internal-job-and-error-codes.md`：已抽象 `internal-auth` / `job-logger`，并为部分核心 API 引入 `ErrorCodes` registry。
  - `.codex/plan/error-codes-expansion.md`：已定义 `ErrorCodes` 的整体策略与首批迁移步骤（核心 API 路由与 billing/credits 强类型约束）。
- 本计划不重新设计或扩展 `ErrorCodes` 体系，而是在既有 registry 与工具到位的前提下：
  - 将 `/api/*` 路由全部收敛到统一错误 envelope 与日志模型；
  - 补齐 Credits 生命周期与边界文档，用于支撑后续领域重构与排障。

---

## 二、范围

- 包含：
  - 所有 API 路由：`src/app/api/**/*/route.ts`
  - 错误与日志规范：`docs/error-logging.md`, `docs/error-codes.md`
  - Credits 相关实现：`src/credits/**/*`, `src/domain/billing/**/*`, `src/lib/server/usecases/*credits*`, `src/payment/**/*`
  - 新增文档：`docs/credits-lifecycle.md`
- 不包含：
  - 更改任何既有业务逻辑（扣费规则、额度计算、Job 调度等）。
  - 对前端 UI 组件 / hooks 的大规模改写（仅在必要时对错误字段名做兼容性调整）。

---

## 三、任务 A：API 错误模型收敛（/api/*）

### A1. 建立现状清单（只读调研）

- 目标：梳理出“已符合规范”和“需要收敛”的 API 路由列表。
- 操作要点：
  - 遍历 `src/app/api/**/*/route.ts`：
    - 记录是否：
      - 使用 `DomainError` 捕获业务错误。
      - 返回 `{ success, error, code?, retryable? }` 结构。
      - 使用 `ErrorCodes` 常量而非裸字符串。
      - 使用 `createLoggerFromHeaders` / `withLogContext` 设置日志上下文。
  - 输出一份本地清单（可在本文件结尾或单独 `.md` 草稿中记录），按路由分类：
    - ✅ 已符合规范。
    - ⚠️ 需要补充 envelope / 日志 / ErrorCodes 的路由。
  - 建议在本文件末尾预留一个“API 路由检查清单”小节，执行时逐个勾选；当清单中所有路由均标记为“已符合规范”且测试通过时，可视为任务 A 完成。

### A2. 统一错误 envelope 结构

- 目标：所有 `/api/*` 在错误路径都返回统一结构：
  ```ts
  {
    success: false,
    error: string,
    code?: string,
    retryable?: boolean,
  }
  ```
- 操作要点（针对 A1 标记为 ⚠️ 的路由）：
  - 引入 `DomainError` 与 `ErrorCodes`（如尚未使用）：
    - `import { DomainError } from '@/lib/domain-errors';`
    - `import { ErrorCodes } from '@/lib/server/error-codes';`
  - 在路由 handler 中统一增加 try/catch 模式：
    - `DomainError` 分支：
      - 使用 `error.code` / `error.retryable`。
      - HTTP 状态：`retryable ? 500 : 400`（如现有逻辑不同，需要逐一评估是否保持旧行为）。
    - 非 DomainError 分支：
      - 日志记录为 `Unexpected error in <route>`。
      - 返回 `code: ErrorCodes.UnexpectedError`, `retryable: true`。
  - 保持已有成功响应与业务分支逻辑不变。

### A3. 对齐 ErrorCodes 使用

- 目标：所有路由中手写的 `code: 'SOME_CODE'` 字符串全部替换为 `ErrorCodes.SomeCode`，并确保值与 `docs/error-codes.md` 一致。
- 操作要点：
  - 在每个路由文件顶部引入 `ErrorCodes`（如 `internal-job-and-error-codes.md` / `error-codes-expansion.md` 已部分覆盖，需检查是否有遗漏）。
  - 对照 `docs/error-codes.md`，将硬编码字符串替换为对应常量：
    - 未登录/未授权 → `ErrorCodes.AuthUnauthorized`
    - Chat/AI 文本/图片/Storage 等错误码 → 使用各自领域下的常量。
  - 如发现路由使用的 code 尚未登记在 `ErrorCodes` 中，先补齐 registry 再替换。

### A4. 日志上下文与 span 收敛

- 目标：所有 `/api/*` 路由使用统一的 logger 模式，保证日志包含 `requestId` / `span` / `route` 等核心字段。
- 操作要点：
  - 对照 `docs/error-logging.md` 中推荐的 span 命名：
    - `api.ai.chat`, `api.ai.text.analyze`, `api.ai.image.generate`, `api.docs.search`, `api.credits.distribute`, `api.storage.upload`, `api.webhooks.stripe` 等。
  - 为每个路由使用：
    - `const logger = createLoggerFromHeaders(request.headers, { span: 'api.xxx', route: '/api/xxx' });`
  - 在错误分支中统一使用 logger 记录：
    - `logger.error({ error, code: error.code, retryable: error.retryable }, 'Domain error in xxx route');`
    - `logger.error({ error }, 'Unexpected error in xxx route');`

### A5. 验证与回归测试

- 执行命令：
  - `pnpm lint`
  - `npx tsc --noEmit`
  - `pnpm test`（至少确保 `src/app/api/__tests__/*` 与 `tests/actions/*` 全部通过）
- 回归重点：
  - 所有断言 `response.json().code` 的测试仍然通过。
  - 未引入新的错误码字符串；旧的 code 文本保持不变。

---

## 四、任务 B：Credits 生命周期与边界文档（docs/credits-lifecycle.md）

### B1. 设计文档结构与受众

- 目标：明确 `docs/credits-lifecycle.md` 的读者与使用场景，避免与现有文档重复。
- 建议结构：
  1. 背景：为什么需要积分体系 & 适用场景（AI 调用计费、套餐/订阅等）。
  2. 核心实体：用户积分余额、积分交易记录、plan/price、lifetime membership。
  3. 生命周期阶段（见 B2）。
  4. 与 Billing/Payment/Auth/User-Lifecycle 的交互边界。
  5. Job 与批处理（发放、过期、Cron/API 触发）。
  6. 不变式与约束（例如：不可出现负余额、过期处理的时序等）。

### B2. 梳理完整生命周期阶段

- 参考实现位置：
  - 注册赠送：
    - `src/lib/user-lifecycle/*`
    - `src/credits/services/credit-ledger-service.ts` 中 `addRegisterGiftCredits`
  - 每月/周期续费发放：
    - `src/domain/billing/billing-service.ts` 中 `handleRenewal`
    - `src/credits/services/credit-ledger-service.ts` 中 `addMonthlyFreeCredits` / `addSubscriptionCredits`
  - Lifetime 用户月度发放：
    - `src/domain/billing/billing-service.ts` 中 `grantLifetimePlan`
    - `src/payment/data-access/user-lifetime-membership-repository.ts`
    - `src/credits/services/credit-ledger-service.ts` 中 `addLifetimeMonthlyCredits`
  - Job/过期处理：
    - `src/credits/distribute.ts`
    - `src/credits/expiry-job.ts`
    - `src/lib/server/usecases/distribute-credits-job.ts`
    - `src/app/api/distribute-credits/route.ts`
  - 消费与扣减：
    - `src/credits/domain/credit-ledger-domain-service.ts`
    - `src/credits/services/credit-ledger-service.ts` 中 `consumeCredits`
    - `src/lib/server/usecases/*with-credits.ts`
- 在文档中对每个阶段给出“事件 → 调用链 → 持久化影响”的端到端说明（可借鉴 `docs/feature-modules.md` 的描述风格）。
  - 最低完成标准：生命周期章节至少覆盖以下入口场景的端到端路径，并明确说明其调用链与持久化影响：
    - 用户注册（注册赠送积分）。
    - 订阅续费（周期性积分发放）。
    - 积分套餐购买或人工调整（如有）。
    - Lifetime 用户月度发放。
    - 积分过期 Job（包括幂等性与失败重试的基本约束）。
    - AI 调用消费（chat/analyze/image 任一代表场景）。

### B3. 描述边界与依赖方向

- 在文档中明确以下边界：
  - UI / Actions / API 与 credits 的交互只通过：
    - `src/credits/credits.ts` 导出的对外 API；
    - `src/lib/server/usecases/*with-credits.ts` 等 usecase。
  - Billing/Payment 与 credits 的依赖：
    - `DefaultBillingService` 仅通过 `CreditsGateway` 接口与 credits 交互。
  - Auth 与 credits 的弱耦合：
    - 通过 `UserLifecycleManager` hooks 触发注册赠送等行为，不直接操作 credits。
  - Job 与 Cron 的触发方式：
    - 仅通过受保护的 `/api/distribute-credits` route；外部任务不直接调用内部 usecase。

### B4. 编写文档与交叉链接

- 新增文件：`docs/credits-lifecycle.md`
  - 按 B1/B2/B3 的结构撰写内容，保持与 `docs/architecture-overview.md` / `docs/feature-modules.md` 相同的语气与格式。
- 更新相关文档的引用：
  - 在 `docs/architecture-overview.md` / `docs/feature-modules.md` 适当位置添加指向 `credits-lifecycle` 的链接。
  - 如有 README 中对核心文档的索引，可增加该文档条目。

### B5. 验证（文档层面）

- 人工检查：
  - 文档中的路径和函数名与当前实现一致。
  - 生命周期描述覆盖了主要入口（注册、订阅续费、积分购买、lifetime、过期处理、AI 调用消费）。
  - 文档中至少列出 3–5 条 Credits 领域不变式（例如：余额不得为负、同一 jobRunId 不得重复入账、过期任务幂等约束等）。
  - 描述与 `docs/error-codes.md` / `docs/error-logging.md` 在错误模型部分保持一致，不产生冲突。

---

## 五、原则与风格约束

- KISS：
  - 错误模型收敛仅做必要统一，不引入额外层次（如复��� error domain 枚举）。
  - 文档聚焦“生命周期 + 边界 + 依赖方向”，避免堆砌实现细节。
- YAGNI：
  - 本轮不尝试覆盖前端所有错误 UI 行为，只对 API 层与文档做统一。
  - 不提前设计复杂的错误分类/子系统拆分，仅用 `ErrorCodes` + `DomainError`。
- DRY：
  - 消除 API 路由中重复的错误处理模式，统一到一个可复制的模板。
  - Credits 生命周期文档作为“单一真相来源”，避免在多个文档中重复描述同一流程。
- SOLID：
  - API route 专注于 HTTP 语义与 envelope；业务错误交由 usecase/domain 产生。
  - 文档帮助稳定领域边界的认知，不推翻现有分层，而是强化其可理解性。

---

## 六、风险与注意事项

- 前端兼容性：在调整 API 错误 envelope 和 `code` 字段时，需要排查所有调用方（包括 `fetch('/api/...')`、前端 hooks 与 SDK），确保不会因字段结构或命名变更导致运行时错误。
- 测试覆盖：若某些 `/api/*` 路由缺乏现成测试，应在重构前后补充至少一条 smoke test，用于验证基本错误路径与 `code` 字段。
- 渐进式落地：建议按路由组（如 AI、storage、webhooks、credits）分批收敛并在每批次后运行测试，避免一次性修改所有路由导致回归面过大。
