# Architecture Overview

## Top-level structure

- `src/app`: Next.js App Router pages and route handlers (API).
- `src/components`: Shared UI components.
- `src/lib`: Cross-cutting libraries (auth, safe actions, domain errors, server usecases, logging).
- `src/credits`: Credits domain (ledger, distribution job, config).
- `src/domain`: Business domains that cross-cut infra (e.g. billing).
- `src/payment`: Payment provider integration and payment domain services.
- `src/db`: Drizzle schema and DB access helpers.
- `src/newsletter`, `src/mail`, `src/notification`: Outbound communication domains.

The general dependency direction is:

`app` (UI / routes) → `lib` / `domain` / `credits` / `payment` → `db` / external providers

## Usecase: AI Chat with Billing & Credits

### High-level flow

1. **API route**: `src/app/api/chat/route.ts`
   - Validates auth via `ensureApiUser`.
   - Enforces rate limit via `enforceRateLimit`.
   - Parses and validates request body with `chatRequestSchema`.
   - Delegates to the usecase `executeAiChatWithBilling`.

2. **Usecase**: `src/lib/server/usecases/execute-ai-chat-with-billing.ts`
   - Orchestrates:
     - Upfront billing / credits checks.
     - Downstream AI provider call.
     - Mapping of provider result to a UI stream response (reasoning + sources).

3. **Domain / infra**
   - Billing / credits rules live in `src/domain/billing` and `src/credits`.
   - Payment provider is accessed through `src/payment`.
   - Logging and rate limiting are centralized under `src/lib/server`.

The route stays thin and focuses on HTTP concerns (auth, rate-limit, request validation, response type), while the usecase encapsulates the business interaction between billing/credits and AI providers.

## Usecase: Credits Distribution Job

### High-level flow

1. **API route**: `src/app/api/distribute-credits/route.ts`
   - 使用 `serverEnv.cronJobs` 中的凭证配置，并通过 `validateInternalJobBasicAuth` 校验 Basic Auth。
   - Only allows triggering the job when credentials match.
   - On success, calls `runCreditsDistributionJob` and returns a JSON envelope:
     ```json
     {
       "success": true,
       "data": {
         "usersCount": number,
         "processedCount": number,
         "errorCount": number
       }
     }
     ```
   - On failure, returns:
     ```json
     {
       "success": false,
       "error": "Distribute credits job failed",
       "code": "CREDITS_DISTRIBUTION_FAILED",
       "retryable": true
     }
     ```

2. **Usecase**: `src/lib/server/usecases/distribute-credits-job.ts`
   - Generates a `jobRunId` for logging and tracing.
   - Logs a “starting” entry with the jobRunId.
   - Calls `distributeCreditsToAllUsers()` from `src/credits/distribute.ts`.
   - Logs a “finished” entry with `{ jobRunId, usersCount, processedCount, errorCount }`.
   - Returns `{ usersCount, processedCount, errorCount }` to the caller; unexpected errors surface as `ErrorCodes.CreditsDistributionFailed`.

3. **Credits distribution domain**: `src/credits/distribute.ts`
   - Orchestrates the core distribution logic:
     - Processes expired credits via `runExpirationJob`.
     - Reads user + payment snapshot using the data-access layer (`createUserBillingReader`).
     - Resolves lifetime memberships and classifies users into:
       - Free users.
       - Lifetime users.
       - Yearly subscription users.
     - Delegates per-segment command generation and execution to `CreditDistributionService`.
   - Uses DB schema from `src/db/schema.ts` and plan configuration from `src/lib/price-plan.ts` and policies under `src/domain/billing`.
   - Auth / envelope expectations for the API route:
     - Missing `CRON_JOBS_USERNAME` / `CRON_JOBS_PASSWORD` → `500` + `CRON_BASIC_AUTH_MISCONFIGURED`.
     - Wrong or missing Basic header → `401` + `AUTH_UNAUTHORIZED`，附带 `WWW-Authenticate: Basic realm="Secure Area"`。
     - Job failure → `500` + `CREDITS_DISTRIBUTION_FAILED`（`retryable: true`）。

The job usecase keeps the API route focused on authentication and HTTP response shape, while centralizing the job orchestration concerns (logging, tracing, and the call into the credits domain) in a reusable server-side entry point that could later be reused by CLI or background worker triggers.

For a complete list of error codes used across APIs and domain services, see `docs/error-codes.md`.  
For a detailed description of the credits lifecycle and domain boundaries, see `docs/credits-lifecycle.md`.  
For a detailed description of the payment lifecycle, Stripe integration and its interaction with credits, see `docs/payment-lifecycle.md`.  
For a detailed description of AI text/chat/image lifecycles and their interaction with credits, see `docs/ai-lifecycle.md`.  
For a detailed description of storage upload/delete lifecycles and provider boundaries, see `docs/storage-lifecycle.md`.  
For developer-oriented guidance and extension patterns, see `docs/developer-guide.md`.
For docs/marketing/blog routing and Source mappings, see the section below.

---

## Docs / Marketing / Blog Source ↔ Route 映射

本项目使用 Fumadocs 的 Source 机制将内容仓库映射到 Next.js 路由，核心映射集中在 `src/lib/source.ts`：

| Source 变量       | baseUrl    | 典型路由前缀示例        | 说明                              |
| ----------------- | ---------- | ------------------------ | --------------------------------- |
| `source`          | `/docs`    | `/docs/...`              | 主文档（架构、API、指南等）。    |
| `changelogSource` | `/changelog` | `/changelog/...`       | 版本变更记录。                    |
| `pagesSource`     | `/pages`   | `/pages/...`             | 营销/静态页面内容。              |
| `authorSource`    | `/author`  | `/author/...`            | 博客作者档案页。                  |
| `categorySource`  | `/category` | `/category/...`        | 博客分类页。                      |
| `blogSource`      | `/blog`    | `/blog/...`              | 博客文章内容。                    |

> 若未来调整 docs/marketing/blog 路由前缀或 Source 配置，应同时更新：  
> - `src/lib/source.ts` 中对应 `baseUrl`；  
> - 本表（用于架构与路由约定的统一视图）；  
> - 如有必要，更新 `docs/governance-index.md` 中指向本表的说明。

---

## Business Invariants & DB Constraints 协作原则

在本模板中，**业务不变量**（domain invariants）与 **数据库约束** 共同保证数据正确性和可演进性，两者分工大致如下：

- **业务不变量（Domain Level）**  
  - 由领域服务 / usecase 层维护，例如：  
    - Credits：余额不能为负、同一周期只能发一次注册赠送、过期规则按 FIFO 扣减（`CreditLedgerDomainService` 系列）。  
    - Billing/Payment：同一 Stripe session 只能记一次账、单笔支付只能发一次积分或授予一次 membership。  
    - AI：在扣费前必须先做免费额度与限流检查，`InsufficientCreditsError` 视为正常业务失败而非系统异常。  
  - 主要通过 **应用层/领域层逻辑 + DomainError** 表达，方便测试与演进：
    - 绝大部分规则在 `src/credits/**`、`src/domain/**`、`src/payment/**` 与 usecase 层实现和测试；
    - 失败路径统一映射为 `ErrorCodes.*`，由 API / safe-action 封装为标准 envelope。

- **数据库约束（DB Level）**  
  - 只负责那些**数据层面“一旦冲突就永远错误”的不变量**，如：  
    - 主键 / 唯一键：`payment` 中的 `providerSessionId` 唯一，防止重复消费 webhook；  
    - 外键：积分账本记录必须引用存在的用户 / 订阅 / 价格 ID；  
    - 基础检查：金额、积分数量为非负，枚举字段只接受有限集合值。  
  - DB 层不做「业务流程」判断（例如「这个套餐是否允许对该用户使用」），这些留给 domain/service 来做，以避免 schema 过于刚性。

**协作策略（推荐实践）：**

- **先在领域层建模，再用 DB 约束兜底结构性错误**  
  - 新增业务规则时优先修改领域服务 / usecase 与对应测试：确保通过 Vitest 直接验证不变量；  
  - 只有当规则具备**绝对稳定性**且属于“数据结构正确性”（如唯一性、引用完整性）时，才同步提升为 DB 约束。

- **对“可恢复”的业务错误，用 DomainError 而不是 DB 约束**  
  - 如“积分不足”“套餐已过期”“当前 plan 不包含某功能”等，都通过 DomainError + 错误码表示，让前端/UI 能做更细粒度反馈与重试提示；  
  - DB 出错（违反约束）通常被视为开发时的 bug 或严重数据异常，只在日志和 Ops 视角出现，不直接暴露给终端用户。

- **幂等与重复处理：优先在领域/服务层建模**  
  - 例如 Stripe webhook 的幂等：  
    - 通过 `PaymentRepository` + `providerSessionId` 唯一约束避免重复 side‑effects；  
    - 同时在 `webhook-handler-credit` 等服务中显式判断“是否已处理过”，并将该逻辑纳入测试。  
  - DB 唯一键负责防止“物理重复行”，领域逻辑负责保证“业务语义幂等”。

在设计新的领域规则或表结构时，可以用下面的问题快速检查：

- 这条规则是否需要对客户端返回可解释的错误码？若是，应建模为 DomainError；  
- 这条规则是否一旦违反，数据就处于不可恢复的错误状态？若是，适合收敛为 DB 约束；  
- 未来是否可能调整这条规则（例如产品策略变更）？若是，尽量保持 DB 简单，将变更集中在领域服务与 usecase。
