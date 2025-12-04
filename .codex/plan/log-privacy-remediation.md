# 日志隐私整改计划（方案 2）

## 上下文

- 审计发现问题：
  1. `src/mail/provider/resend.ts` warn 日志包含 `to` 邮箱。
  2. `src/newsletter/provider/resend.ts` 多处 info/error/debug 日志直接输出 email。
  3. `src/lib/server/usecases/generate-image-with-credits.ts` 在错误日志中输出 `result`，其中包含 base64 图像与 prompt。
- 目标：在不破坏现有行为的前提下，引入共享 helper，对邮箱日志和 AI 结果日志做统一脱敏/裁剪，满足 `docs/error-logging.md` 与 `.codex/rules/logging-and-observability-best-practices.md`。

## 执行计划

1. **Mail/Newsletter 日志封装**
   - 在 `src/lib/server/logger.ts` 新增 `createEmailLogFields(email: string, extra?: Record<string, unknown>)`，内部调用 `emailHashForLog` 并返回 `{ emailHash, emailDomain, ...extra }`。
   - Mail provider、Newsletter provider 使用该 helper 替换所有 `logger.*({ email })`。
   - 同时保留业务上下文（如 `audienceId`, `status`），确保日志可追踪。

2. **AI 图像结果裁剪**
   - 在 `src/lib/server/usecases/generate-image-with-credits.ts` 引入 `sanitizeImageResultForLog(result)` helper，仅输出 `hasImage`, `warningCount`, `fields` 等摘要，杜绝 base64/prompt 泄露。
   - 调整相关 `logger.error/warn` 调用以使用裁剪后的结构。

3. **文档与计划更新**
   - 在 `.codex/plan/server-actions-domain-error-unification.md` 的日志隐私项中记录该整改。
   - 若 `docs/error-logging.md` 需要说明新的 helper，用一行描述邮箱脱敏策略。

4. **验证**
   - 静态检查：`rg "logger\\.(info|warn|error)\\({[^}]*email"` 仅匹配允许的 helper 使用。
   - 运行必要测试（若无针对性测试，可跳过，但需在记录中说明）。

## 预期交付

- 邮件/Newsletter Provider 日志仅含 hash/domain，无明文 email。
- AI usecase 错误日志中不再包含 base64/prompt。
- 计划/文档同步记录整改完成情况。
