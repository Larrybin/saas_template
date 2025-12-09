# 修复计划（2025-12-09）

> 基于最新报告复核结果，聚焦仍未解决的高优问题，并列出下一轮行动项。

## 高优先级
1. **Credits 账本原子性 / 幂等加固**（参见 `.codex/plan/credits-ledger-atomicity.md`）  
   - 范围：`src/credits/domain/credit-ledger-domain-service.ts`, `src/credits/data-access/credit-ledger-repository.ts`。  
   - 目标：在 `addCredits` 与 `upsertUserCredit` 中引入统一事务 + `ON CONFLICT`/行锁，确保余额与流水一致；补充结构化日志（requestId/periodKey）。  
   - 当前：已在 `CreditLedgerDomainService` 中统一使用事务包装余额与流水写入，`CreditLedgerRepository.upsertUserCredit` 采用 `insert ... onConflictDoUpdate` + SQL 原子累加；并发集成测试与结构化日志（含 periodKey）已落地，账本原子性核心风险视为已解决。
2. **Creem Webhook 安全返回**（参见 `.codex/plan/creem-webhook-security.md`）  
   - 范围：`src/lib/server/creem-webhook.ts`, `src/app/api/webhooks/creem/route.ts`, `docs/api-reference.md`。  
   - 目标：缺 payload/signature/验签失败时统一返回 `PAYMENT_SECURITY_VIOLATION` 并记录 `reason`; 更新文档与监控。  
   - 当前：Webhook handler 已对缺 payload/签名及验签失败抛出 `PAYMENT_SECURITY_VIOLATION`，路由层按该错误码返回 400，`docs/payment-lifecycle.md` 与 `docs/api-reference.md` 已同步；监控与静态脚本校验仍保留为后续增强。
3. **回调 URL 安全**（参见 `.codex/plan/proxy-callback-hardening.md`）  
   - 范围：`src/proxy/helpers.ts`, 路由守卫相关测试。  
   - 目标：拒绝 `//`/绝对 URL，必要时引入 allowlist，并为决策添加日志/metrics；配套单元测试。  
   - 当前：`buildSafeCallbackUrl` 已拒绝 `//` 及路径中嵌入的 `http(s)://`，非法值统一回退登录页并输出 `{ reason, originalPath }` 日志；allowlist 与 metrics 视为后续增强。

## 中优先级
- **Stripe Provider 配置可观测性**（参见 `.codex/plan/stripe-env-observability.md`）：在 `stripe-payment-factory` 中对缺失 env 输出结构化日志并接入告警；避免无提示崩溃。当前：缺失 `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` 时已记录 `{ missingKeys }` 并抛出 `ConfigurationError`，且有单测覆盖；专门的 metrics 与启动前预检尚未实现。
- **存储 Provider 可观测性与预签名**（参见 `.codex/plan/storage-provider-resilience.md`）：在 `S3Provider` 中补重试/metrics，评估引入预签名上传与 HTTPS 强制策略。当前：`S3Provider` 已强制 HTTPS、增加带指数退避的重试，以及 `createPresignedUploadUrl` 能力与 `/api/storage/presign` 路由；前端通过 `uploadFileFromBrowser` 优先走预签名直传并在 Provider 错误时回退直传 API；metrics 仍待后续统一接入。
- **通知/邮件幂等与指标**（参见 `.codex/plan/notification-mail-idempotency.md`）：为 `ensure-access-and-checkout`、`notification/*`、`mail/provider/*` 增加重试/幂等键与 metrics。当前：`sendMessageToDiscord`/`sendMessageToFeishu` 与 `ResendProvider.sendRawEmail` 已接入通用 `withRetry` helper，对网络/5xx 等操作性错误进行有限重试并输出结构化日志；Actions 层显式幂等键与独立 metrics 客户端尚未落地。
- **Routes 单一来源**（参见 `.codex/plan/routes-guard-single-source.md`）：依据 `Routes` 枚举自动生成 `protectedRoutes`/`routesNotAllowedByLoggedInUsers` 清单。当前：`src/routes.ts` 新增 `routeMeta: Record<Routes, { protected?: boolean; disallowedWhenLoggedIn?: boolean }>`，并据此派生 `protectedRoutes` 与 `routesNotAllowedByLoggedInUsers`，E2E 守卫测试与 proxy helpers 仍复用同一来源；额外的脚本/lint 校验可视为后续强化项。

## 低优先级
- **Domain Core 审计**：持续监控多 Provider/多 region 幂等键扩展需求。
- **Analytics 降级**：为 `src/analytics/*.tsx` 增加错误边界和降级逻辑。

各任务在进入开发前需更新相应 `.codex/plan/*` 条目，并在 PR 模板中引用该计划以保持追踪。
