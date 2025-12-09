---
title: Creem Webhook 安全返回与观测
---

## 背景
- `/api/webhooks/creem` 在缺失 payload/signature 或验签失败时仍返回 `UNEXPECTED_ERROR`，难以区分安全事件。
- 需要统一与 Stripe Webhook 相同的错误码（`PAYMENT_SECURITY_VIOLATION`）、记录 `reason` 字段、更新文档。

## 参考最佳实践
- Hook0 Webhook 平台强调使用 HMAC-SHA256 签名验证与多阶段重试来保障可靠、安全的投递（`/hook0/hook0` summary）。

## 方案与当前状态
1. **统一错误码与日志** ✅ 已完成  
   - 在 `src/lib/server/creem-webhook.ts` 中：
     - payload 为空或缺少 `creem-signature` 时，记录 `reason: 'missing-payload' | 'missing-signature'`，并抛出 `PaymentSecurityViolation`。  
     - 验签失败时，记录 `reason: 'invalid-signature'` 与 `signatureHeader`，并抛出 `PaymentSecurityViolation`。  
   - `src/app/api/webhooks/creem/route.ts` 去掉路由层的 payload 特判，直接透传 `DomainError`；由 handler 决定 HTTP status（安全错误统一走 400）。
2. **文档同步** ✅ 已完成  
   - `docs/payment-lifecycle.md`：补充 Creem Webhook 错误路径与 `reason` 字段说明。  
   - `docs/api-reference.md`：新增 `POST /api/webhooks/creem` 章节，记录鉴权方式、错误码（`PAYMENT_SECURITY_VIOLATION` / `CREEM_WEBHOOK_MISCONFIGURED` / `UNEXPECTED_ERROR` 等）与行为。  
3. **脚本校验** ⏳ 待后续轮次引入  
   - 仍可在 `scripts/check-protocol-and-errors.ts` 中追加对 `PAYMENT_SECURITY_VIOLATION` 用途的静态检查（例如确保所有支付安全错误都映射为该 code），本轮未改动脚本。
4. **监控接入** ⏳ 建议后续由 Ops 侧落地  
   - 当前已在 handler 中输出 `{ reason, signatureHeader }` 等字段，后续可在 APM/告警规则中按 `span = api.webhooks.creem` + `code = PAYMENT_SECURITY_VIOLATION` 聚合安全事件。
