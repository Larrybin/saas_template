## 任务：fix-distribute-credits-401-envelope

### 背景与目标

- 背景：`.codex/plan/protocol-future-techdebt-report.md` 标记了 `/api/distribute-credits` 的 401 响应曾经是非 JSON 文本特例，与统一 Envelope 协议不一致。
- 当前代码：`src/app/api/distribute-credits/route.ts` 已返回 JSON envelope + `AUTH_UNAUTHORIZED`，但：
  - env 未配置与凭证错误没有在 HTTP 状态 / code 上区分；
  - `.codex/rules/api-protocol-and-error-codes-best-practices.md` 和 `docs/api-reference.md` 仍保留旧的“401 文本特例”描述；
  - `distribute-credits-route.test.ts` 对 401 分支只断言状态码与 Header，未守护 JSON envelope 结构。
- 目标：按统一协议与 best practices 将 `/api/distribute-credits` 401/5xx 行为完全收口：
  - 凭证错误（含缺 header / 错误凭证） → `401` + Basic `WWW-Authenticate` + JSON envelope（`AUTH_UNAUTHORIZED`）。
  - env 未配置（`CRON_JOBS_USERNAME/PASSWORD` 缺失） → `500` + JSON envelope（`CRON_BASIC_AUTH_MISCONFIGURED`）。
  - 所有关联文档 / 规则 / 测试与实现一致。

### 设计原则

- KISS / YAGNI：
  - Route 负责 env/config 分支与 HTTP 协议（状态码、Header），不在 helper 中混合配置错误逻辑。
  - `validateInternalJobBasicAuth` 专注于 Basic header 解析与凭证比对，返回简单布尔结果。
- DRY：
  - 401 envelope 结构与 `ensureApiUser` / `safe-action` 中 `AUTH_UNAUTHORIZED` 保持一致，避免多种变体。
- SOLID：
  - 单一职责：env 配置错误 → Route；凭证校验 → helper；错误码注册 → `error-codes.ts`；文档维护 → `docs/*`。

### 实施步骤（对应 Codex 计划）

1. 扩展错误码与内部鉴权实现方案 A
   - 在 `src/lib/server/error-codes.ts` 中新增：
     - `CronBasicAuthMisconfigured: 'CRON_BASIC_AUTH_MISCONFIGURED'`。
   - 调整 `src/lib/server/internal-auth.ts`：
     - 假设传入的 `expected` 为完整凭证，不再承担 env 缺失判断。
     - 对缺失/格式错误的 `Authorization` header 与凭证不匹配分别记录 warn 日志，返回 `false`。
2. 补充 `/api/distribute-credits` 路由逻辑
   - 在 `src/app/api/distribute-credits/route.ts` 中：
     - 显式区分 env 未配置与凭证错误：
       - env 未配置（`cronJobs.username/password` 任一缺失）：
         - 记录 error 日志（包含 span/route）。
         - 返回 `500` + `{ success: false, error: 'Cron basic auth credentials misconfigured', code: ErrorCodes.CronBasicAuthMisconfigured, retryable: false }`。
       - env 完整但 `validateInternalJobBasicAuth` 返回 `false`：
         - 返回 `401` + `{ success: false, error: 'Unauthorized', code: ErrorCodes.AuthUnauthorized, retryable: false }`，并携带 Basic `WWW-Authenticate` header。
     - 保持 Job 成功/失败分支现有行为（`CREDITS_DISTRIBUTION_FAILED`）不变。
3. 更新测试守护协议
   - 修改 `src/app/api/__tests__/distribute-credits-route.test.ts`：
     - 对 401 场景：
       - 除 `status === 401`、`WWW-Authenticate` 外，增加 JSON envelope 断言：
         - `success === false`，`code === 'AUTH_UNAUTHORIZED'`，`retryable === false`。
     - 对 env 未配置场景：
       - 模拟 `serverEnv.cronJobs.username/password` 为 `undefined`（默认态）。
       - 携带任意 Basic header，请求后断言：
         - `status === 500`；
         - JSON 中 `code === 'CRON_BASIC_AUTH_MISCONFIGURED'`，`success === false`。
4. 文档与规则对齐
   - `docs/error-codes.md`：
     - 在合适小节（如 “Ops / Cron”）新增 `CRON_BASIC_AUTH_MISCONFIGURED` 行，描述 env 配置错误含义。
   - `docs/api-reference.md` 的 `/api/distribute-credits` 小节：
     - 更新 Failure 描述为：
       - `401 Unauthorized` → Basic Auth 失败，返回 `AUTH_UNAUTHORIZED` JSON envelope；
       - `500` → env 未配置（`CRON_BASIC_AUTH_MISCONFIGURED`）或 Job 内部失败（`CREDITS_DISTRIBUTION_FAILED`）。
     - 可示例列出 401/500 的典型 JSON 结构。
   - `.codex/rules/api-protocol-and-error-codes-best-practices.md`：
     - 删除“`/api/distribute-credits` 401 是纯文本 Unauthorized”的特例说明；
     - 补充说明：该路由在 200/401/5xx 场景均使用统一 JSON envelope，401 仅在 Header 使用 Basic。
   - `.codex/plan/protocol-future-techdebt-report.md`：
     - 将 “`/api/distribute-credits` 的 401 响应非 JSON” 技术债条目标记为已完成，改写为：
       - 已统一为 JSON envelope，并新增 `CRON_BASIC_AUTH_MISCONFIGURED` 区分 env misconfig。
5. 验证
   - 运行针对 `distribute-credits-route.test.ts` 的单测，确保：
     - 401/500 分支 envelope 与 code 与预期一致；
     - 现有成功/失败 Job 行为未被破坏。
   - 若测试命令在本地为 `pnpm test`，优先仅跑目标测试文件以缩短反馈时间。

