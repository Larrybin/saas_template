# 日志与隐私精细化审查计划

## 1. 范围与目标

- 覆盖模块：`src/actions/*`, `src/app/api/*`, `src/lib/server/usecases/*`, `src/payment/*`, `src/mail/*`, 以及相关共享基础设施（AI、Credits、Newsletter、Contact、Usecase 层）。
- 目标：验证所有 server-side 日志符合 `docs/error-logging.md` 与 `.codex/rules/logging-and-observability-best-practices.md`，确保：
  - 日志字段包含 `span` / `requestId` / `userId` 等上下文；
  - 不记录敏感信息（email、token、支付信息等），必要时采用哈希/匿名化；
  - 关键 DomainError/ErrorCode 场景具备结构化日志。

## 2. 检查清单（分域）

| 域 | 入口目录 | 关键文件（需逐一检查） | 说明 |
| --- | --- | --- | --- |
| Server Actions | `src/actions/` | 全部 `.ts`（除 `schemas.ts`） | 统一 `withActionErrorBoundary`，确认 `getLogContext` 内容合法 |
| API Routes | `src/app/api/**/route.ts` | 所有 route | 检查 `createLoggerFromHeaders` 使用与敏感字段 |
| Usecases | `src/lib/server/usecases/*` | 所有 usecase + 测试 | 聚焦 AI/Credits 日志上下文 |
| Payment | `src/payment/**` | `services/*.ts`, `provider-factory.ts`, `types.ts` | 检查 customer/payment 相关日志是否脱敏 |
| Mail | `src/mail/**` | `mail-config-provider.ts`, `provider/*.ts`, `index.ts` | 邮箱/模板日志不应泄露收件人 |
| AI 服务 | `src/ai/**` | Hooks + server 入口 | 确认 requestId/userId、避免提示词等敏感内容被记录 |
| 其它共享模块 | `src/lib/safe-action.ts`, `src/lib/server/logger.ts`, `tests/helpers/*` | 确保 helper 使用符合规范 |

## 3. 方法

1. **静态扫描**：使用 `rg "logger\\.(error|warn|info)"`、`rg "getLogger"`、`rg "email"` 等命令，对每个目录生成日志调用列表，初步识别潜在问题。
2. **逐文件查阅**：对高风险文件（AI usecases、Payment services、Mail provider、DomainError helper）进行源码阅读，确认上下文字段与 PII 处理方式。
3. **记录发现**：将问题分为“缺上下文”“敏感字段”“其它”（如重复日志、错误级别不当），在本文件追加列表，并同步至 `.codex/plan/server-actions-domain-error-unification.md`。
4. **输出建议**：如需代码修改，列出推荐改动（例如新增 `emailHashForLog`、补充 `withLogContext` 等），在执行阶段落地。

## 4. 交付物

- 本文档中附加的扫描结果与问题清单。
- `.codex/plan/server-actions-domain-error-unification.md` 中“日志与隐私审查”段落的最新状态。
- （如需要）对应代码/文档改动的 MR 说明。

---

## 5. 当前发现（2025-12-05 扫描）

1. **`src/mail/provider/resend.ts`**  
   - `logger.warn('Missing required fields...', { from: this.from, to, subject })` 直接记录收件人邮箱，违反“error/warn 不含 PII”原则。需改成 `emailHashForLog(to)` 或只记录域名/匿名标识。
2. **`src/newsletter/provider/resend.ts`**  
   - 多处 `logger.info/logger.error` 将 `email` 字段完整写入日志（subscribe/unsubscribe/check status 全流程）。鉴于 Newsletter 操作频繁，应统一使用脱敏字段（如 `emailHashForLog`）并在日志中保留 `audienceId`、`status` 等非 PII 上下文。
3. **`src/lib/server/usecases/generate-image-with-credits.ts:195`**  
   - 在错误路径 `logger.error('Image generation returned invalid result shape', { result })` 会记录完整的 provider 返回对象，包含 base64 图片数据与 prompt 文本，既浪费日志成本又存在隐私风险。建议仅记录 `provider`, `modelId`, `hasImage` 等摘要信息，必要时截断/省略 `result`.

> 其它 Actions / API routes / Payment / Credits usecase 经抽样未见直接输出邮箱或 token，均附带 `span`+`userId`（或 `requestId`）上下文，符合 `docs/error-logging.md`。
