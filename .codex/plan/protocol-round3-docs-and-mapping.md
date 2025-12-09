# 协议治理第 3 轮：文档 / Source / env / span 映射收口

> 对应技术债条目：#9、#10、#19、#12  
> 范围：仅涉及 docs/Source/env 映射与日志 span 文档一致性检查，不改动业务逻辑或协议形态。

---

## 1. 目标

- 在代码和文档中正式固定 docs/marketing/blog Source 的路由前缀（特别是 `/pages`），关闭遗留 TODO。
- 提供集中视图描述「Source ↔ Route」与「env ↔ 协议行为」映射，降低未来重构与运维排查成本。
- 在现有协议检查脚本中引入 span ↔ `docs/error-logging.md` 表格的一致性检查，以 warning 形式提示潜在漂移。

---

## 2. 已落实的工作

### 2.1 关闭 pagesSource TODO 并固定 `/pages` 前缀（#9）

- 文件：`src/lib/source.ts`
  - 将 `pagesSource` 上的 TODO 注释替换为正式说明：
    - 说明该 Source 使用固定的 `/pages` 作为营销/静态页面的路由前缀。
  - `pagesSource` 的 `baseUrl` 仍为 `'/pages'`，未调整实际行为。

### 2.2 Source ↔ Route 映射表（#9 / #10）

- 文件：`docs/architecture-overview.md`
  - 新增小节「Docs / Marketing / Blog Source ↔ Route 映射」，以表格形式集中说明：
    - `source` → `/docs`：主文档（架构、API、指南等）。
    - `changelogSource` → `/changelog`：版本变更记录。
    - `pagesSource` → `/pages`：营销/静态页面内容。
    - `authorSource` → `/author`：博客作者档案页。
    - `categorySource` → `/category`：博客分类页。
    - `blogSource` → `/blog`：博客文章内容。
  - 提醒：若未来调整 docs/marketing/blog 路由前缀或 Source 配置，应同步更新：
    - `src/lib/source.ts` 中 `baseUrl`；
    - 本映射表；
    - 以及必要时在 `docs/governance-index.md` 中更新说明。

### 2.3 Env ↔ 协议行为映射表（#19）

- 文件：`docs/env-and-ops.md`
  - 新增小节「Env ↔ 协议行为映射」，集中列出关键 env 及其对应协议行为，示例包括：
    - `STRIPE_SECRET_KEY`：Stripe 客户端初始化失败时，会使相关支付流程不可用（视为配置错误，需要修正后重新部署）。
    - `STRIPE_WEBHOOK_SECRET`：`POST /api/webhooks/stripe` 验签失败时抛 `PAYMENT_SECURITY_VIOLATION`（400，`retryable: false`）。
    - `CREEM_API_KEY` / `CREEM_API_URL` / `CREEM_WEBHOOK_SECRET`：Creem Provider 与 Webhook 的验签/调用行为，错误时可能抛 `PAYMENT_SECURITY_VIOLATION` 或 `CREEM_WEBHOOK_MISCONFIGURED`。
    - `CRON_JOBS_USERNAME` / `CRON_JOBS_PASSWORD`：`GET /api/distribute-credits` 中：
      - 缺失 → 500 + `CRON_BASIC_AUTH_MISCONFIGURED`；
      - 错误 Basic Auth → 401 + `AUTH_UNAUTHORIZED`。
    - Storage 相关 env（`STORAGE_*`）与 `/api/storage/upload` 的错误行为（例如 `STORAGE_PROVIDER_ERROR` / `STORAGE_UNKNOWN_ERROR`）。
    - AI Provider 相关 env（如 `OPENAI_API_KEY` 等）与 AI 路由（chat/analyze-content/generate-images）的错误码映射（例如 `AI_CONTENT_AUTH_ERROR` / `AI_CONTENT_SERVICE_UNAVAILABLE`）。
  - 提示运维在监控系统中基于 `span` + `code` 组合设置告警，例如：
    - `span = api.credits.distribute` 且 `code = CRON_BASIC_AUTH_MISCONFIGURED`。

### 2.4 span ↔ `docs/error-logging.md` 一致性检查（#12）

- 文件：`scripts/check-protocol-and-errors.ts`
  - 新增常量：`ERROR_LOGGING_DOC_FILE = path.join('docs', 'error-logging.md')`。
  - 新增函数：`checkSpansDocumented(repoRoot, violations)`：
    - 代码侧：
      - 遍历 `src` 下所有 `.ts` 文件，使用正则 `span\s*:\s*['"]([a-zA-Z0-9_.-]+)['"]` 匹配 `span` 字段；
      - 仅收集包含 `.` 的 span（例如 `api.ai.chat`、`api.storage.upload` 等），组成 `codeSpans` 集合。
    - 文档侧：
      - 读取 `docs/error-logging.md`，使用正则 `` `([a-z0-9_.-]+)` `` 匹配 span 名；
      - 同样筛选包含 `.` 的 span，组成 `docSpans` 集合。
    - 差异输出（全部为 `warn` 级别）：
      - `codeSpans - docSpans`：span 在代码中使用但未在文档中出现；
      - `docSpans - codeSpans`：span 在文档表中出现但代码中未见。
  - 在 `main()` 中追加调用：
    - `checkSpansDocumented(repoRoot, violations);`
  - 该检查只输出 warning，不会阻断 CI，主要用于发现潜在漂移，是否更新文档由人工决定。

---

## 3. 与技术债条目的映射

- `#9 Docs/Marketing Source baseUrl TODO 未关闭`
  - 通过在 `src/lib/source.ts` 中移除 TODO 并在 `docs/architecture-overview.md` 中固定 `/pages` 映射落地。
- `#10 文档 Source 与路由映射缺乏集中声明`
  - 通过 `docs/architecture-overview.md` 中的「Source ↔ Route」表实现集中声明。
- `#19 env/config 与协议行为的耦合点文档化不充分`
  - 通过 `docs/env-and-ops.md` 中新增「Env ↔ 协议行为映射」表，集中描述敏感 env 对协议行为及错误码的影响。
- `#12 Error Logging 文档中的 span 表与实际使用可能漂移`
  - 通过 `checkSpansDocumented` 将 span ↔ 文档的一致性纳入 `pnpm check:protocol` 的 warning 输出。

---

## 4. 后续建议

- 当新增或调整 API / usecase 的 span 时：
  - 运行 `pnpm check:protocol`，留意 span 相关 warning 输出；
  - 视需要更新 `docs/error-logging.md` 中的 span 表格。
- 当新增 Source 或调整 docs/marketing/blog 路由前缀时：
  - 同步更新 `src/lib/source.ts` 与 `docs/architecture-overview.md` 的映射表；
  - 视需要在 `docs/governance-index.md` 中补充说明。
- 当引入新的 env 或改变其对协议行为的影响时：
  - 更新 `docs/env-and-ops.md` 中的 Env ↔ 协议行为映射表；
  - 并检查相关 API 文档及错误码是否需要同步更新。

