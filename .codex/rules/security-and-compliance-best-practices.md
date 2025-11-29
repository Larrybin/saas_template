---
title: 安全与合规最佳实践
description: 基于 MkSaaS 模板的认证、安全存储与合规性设计规范
---

## 适用范围

- 认证与会话：`src/lib/auth.ts`、`src/lib/server/api-auth.ts`、`src/app/api/auth/[...all]`
- 支付与敏感操作：`src/payment/*`、`src/app/api/webhooks/stripe`、`src/app/api/distribute-credits`
- 存储与日志：`src/storage/*`、`src/lib/server/logger.ts`、`docs/error-logging.md`
- 配置与环境：`src/env/*`、`env.example`、`docs/env-and-ops.md`

## 设计目标

- 在默认情况下提供“安全默认值”（secure by default），降低常见安全错误风险。
- 避免敏感数据泄漏到前端、日志或第三方系统。
- 为支付、积分、AI 使用等关键流程提供最小权限与防滥用保护。

## 核心原则

1. **最小权限与职责分离**
   - Auth 模块只负责身份认证与会话管理，不直接承担业务决策。
   - 支付模块通过 Provider 接口访问 Stripe，不在其它模块中散落 Stripe SDK 调用。
   - 存储模块对上传 / 删除做严格校验与权限控制。

2. **安全存储与传输**
   - 机密信息只存储在服务端环境变量中（无 `NEXT_PUBLIC_` 前缀）。
   - 支持 https / secure cookie 等策略（依赖部署环境配置）。

3. **防滥用与防重放**
   - 所有关键 API（AI、存储、Credits 分发等）均需鉴权与限流。
   - Webhook 与内部 Job 使用独立认证机制（如 Stripe 签名、Basic Auth），并实现幂等。

4. **日志与隐私**
   - 日志应包含足够的上下文（requestId、userId、route），但避免敏感内容（密码、token、完整卡号）。
   - 错误信息在返回给前端时避免暴露内部实现细节。

## 实践要点（结合本仓库）

1. 认证与权限
   - `src/lib/auth.ts` 使用 better-auth 统一管理用户与会话，并通过 databaseHooks 实现用户生命周期集成。
   - `ensureApiUser` 在 API route 层提供统一的 Bearer 风格认证与封禁用户处理。

2. 支付与 Webhook
   - `src/payment/*` 将 Stripe 集成封装在 `StripePaymentService` 中，通过统一入口 `createCheckout` / `createCustomerPortal` / `handleWebhookEvent` 暴露。
   - `/api/webhooks/stripe`：
     - 验证 `stripe-signature` 并处理 Webhook 事件，对异常使用统一错误码与日志。
   - `/api/distribute-credits` 使用 Basic Auth 与 `serverEnv.cronJobs.*` 凭证保护内部 Job。

3. 存储与上传
   - `/api/storage/upload` 对 Content-Type、文件大小、类型与路径做多重校验，并将 userId 纳入路径，降低越权风险。

4. 配置与环境
   - `env.example` 与 `docs/env-and-ops.md` 记录了 Auth / Stripe / AI / Analytics 等敏感配置变量。
   - `src/env` 模块封装了环境变量访问，减少在业务代码中直接读 `process.env`。
   - Demo 标志与生产环境约束：
     - 判定是否为演示站点的逻辑（如 `isDemoWebsite()`）只能在受控 demo 环境返回 `true`，**生产环境必须保证始终为 `false`**。
     - 生产配置中应通过明确的环境变量（如 `APP_ENV=production` 或 `IS_DEMO=false`）驱动该判断，而不是依赖隐含约定。
     - 建议在启动过程中或健康检查中加入断言：一旦检测到生产环境 `isDemoWebsite()` 为 `true`，立即告警或阻断，以防 demo 级放宽逻辑在生产暴露管理操作。

## 反模式（应避免）

- 在客户端暴露服务端密钥（如错误使用 `NEXT_PUBLIC_` 前缀）。
- 在日志或错误消息中包含敏感数据（密码、token、完整 URL 包含敏感 query 等）。
- 为了“方便调试”绕过认证 / 限流逻辑，或在生产环境保留调试后门。
- 在生产环境错误配置 demo 标志（如 `isDemoWebsite()` 返回 `true`），导致演示用的宽松权限策略在生产环境生效。

## Checklist

- [ ] 所有访问受保护资源的 API 都实现了鉴权与限流。
- [ ] 支付与 Webhook 处理逻辑不存在重复处理或未验证签名的路径。
- [ ] 存储上传路径与权限校验在所有入口处都已覆盖。
- [ ] 日志与 Analytics 系统中不记录敏感信息。

## 实施进度 Checklist

- 已基本符合
  - [x] better-auth + `ensureApiUser` 为 API 路由提供了统一认证入口，并处理封禁用户场景。
  - [x] 支付与 Stripe Webhook 通过集中模块与签名验证进行集成，降低安全风险。
  - [x] 存储上传 API 已实现严格的参数与路径校验，且所有上传都需要登录。
  - [x] `env.example` 将敏感配置隔离为环境变量，`src/env` 对其进行集中管理。
- 尚待调整 / 确认
  - [ ] 是否已在部署环境中启用严格的安全头部（CSP、HSTS 等）与 Cookie 属性（Secure、HttpOnly 等）。
  - [ ] 是否对关键 Job / Webhook 引入幂等键记录，以防止重放攻击导致重复扣费或重复发放。
  - [ ] 是否有定期的日志抽样与安全审计流程，以发现潜在的敏感信息泄漏或异常访问模式。
