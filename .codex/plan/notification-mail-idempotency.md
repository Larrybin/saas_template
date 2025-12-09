---
title: Actions / 通知 / 邮件幂等与指标
---

## 背景
- `ensure-access-and-checkout`、`notification/discord|feishu` 以及 `mail/provider/resend` 目前无幂等键、无重试/指标，失败后仅记录日志。

## 参考最佳实践
- Node.js Best Practices 提倡对错误流进行完整测试与统一处理，以区分可恢复的操作性错误（例如网络/第三方失败），从而采取重试与监控措施（`/goldbergyoni/nodebestpractices`，“Test error flows” & “Operational vs programmer errors”）。

## 方案
1. **Actions 幂等键**  
   - 在 `ensureAccessAndCheckout` 输入中要求携带 `idempotencyKey`（前端使用 userId+capability+timestamp 组合），并在 server action 内对 key 做幂等缓存；避免重复创建 checkout session。
2. **通知/邮件重试**  
   - 将 `sendMessageToDiscord` 等提取为具备重试的 helper（使用 `promise-retry` 或自定义指数退避），失败后暴露 metrics 与 structured log。
3. **指标与监控**  
   - 引入 `notification_delivery_success_total` / `notification_delivery_failure_total`、`mail_send_duration_seconds` 等指标，并在 logger 中输出 `provider`, `retryCount`, `status`.
4. **错误封装**  
   - 使用统一的 `OperationalError`（包含 `isRetryable`）包装第三方错误，供上层 action 判断是否继续重试或提示用户。
5. **文档与测试**  
   - 在 `docs/architecture-overview.md` 或 `docs/governance-index.md` 补充“通知/邮件幂等与监控”章节。  
   - 增加测试覆盖：模拟外部 5xx、网络错误、成功重试路径。

## 当前状态（更新 2025-12-09）
- 🔄 Actions 幂等键：`ensure-access-and-checkout` 仍采用「先检查 hasAccess，后发起 checkout」模式，未引入显式 `idempotencyKey` 或本地幂等表；资金与账本幂等继续依赖 Stripe idempotency key + Webhook + 领域服务，在当前阶段避免与底层幂等机制重复设计。  
- ✅ 通知重试与日志：`sendMessageToDiscord` 与 `sendMessageToFeishu` 现通过通用 `withRetry('notification.*.send', fn, options)` helper 增加最多 3 次的指数退避重试，对 5xx/网络错误作为可重试的操作性错误处理，对 4xx 则视为非重试错误；所有尝试都输出结构化日志（含 `operation`, `attempt`, `maxAttempts`, `status` 等），保持“不打断支付主链路”的前提下提升送达率与可观测性。  
- ✅ 邮件发送重试与日志：`ResendProvider.sendRawEmail` 采用同一个 `withRetry('mail.resend.send', ...)` 包裹 `resend.emails.send` 调用，对返回的 `error` 与抛出的异常进行有限次重试，最终成功时返回 `{ success: true, messageId }`，连续失败时记录“after retries”级日志并返回 `{ success: false }`。构造阶段的配置错误（`RESEND_API_KEY` / `fromEmail` 缺失）仍在构造函数中直接抛出，保持 fail-fast。  
- ⏳ Metrics 与统一 OperationalError：当前仅通过 logger 输出 retry 相关字段，尚未引入独立的 metrics 客户端（如 Prometheus/DataDog）或统一的 `OperationalError` 类型；待监控栈选型确定后，可在 `withRetry` 或集中错误处理层中补充指标上报与错误分级。  
- ⏳ Actions 幂等增强：`ensure-access-and-checkout` 尚未实现显式的幂等缓存（如本地 idempotency 表或 checkout 复用逻辑）；如未来需要在 UX 上“复用同一 checkout session”，将通过单独的幂等存储设计解决，而不是复用 Stripe 层的 idempotency key。
