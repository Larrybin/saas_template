---
title: Global Security Baseline Hardening
description: 为整套 SaaS 模板补齐统一安全头、文件上传魔数校验与会话/访问能力边界的安全基线。
---

## 背景与目标

- 现有模板已在 Payment/Billing/Credits/Auth/Storage 等领域建立清晰边界，但缺少统一的 TLS/HSTS/CSP 等安全头约定。
- 会话管理依赖 Better Auth 默认安全配置，ExternalAccessProvider 仅在 Creem Phase B-Plugin 子阶段中启用，对其安全边界需要文档化。
- Storage 上传接口已经具备登录校验、速率限制、体积与 MIME 白名单控制，但尚未做魔数校验。

本计划的目标是：

- 在 Next.js `next.config.ts` 中提供统一的安全头基线，并对敏感路由叠加更严格的缓存策略；
- 为 Storage 上传增加基本魔数校验，避免仅依赖 `file.type`；
- 明确 Better Auth 会话与 ExternalAccessProvider 的安全不变式。

## 路由安全分级

- **全局基线（所有路径）**
  - 适用范围：`/:path*`
  - 安全头：
    - `Content-Security-Policy`（无 nonce 模式，兼容 App Router）：
      - `default-src 'self'`
      - `script-src 'self' 'unsafe-inline' 'unsafe-eval' https:`（dev）
      - `script-src 'self' 'unsafe-inline' https:`（prod）
      - `style-src 'self' 'unsafe-inline' https:`
      - `img-src 'self' data: blob: https:`
      - `connect-src 'self' https:`
      - `font-src 'self' data: https:`
      - `frame-ancestors 'none'`
      - `form-action 'self'`
      - `base-uri self`
      - `upgrade-insecure-requests`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()`
    - `X-Frame-Options: DENY`
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`（仅在 `NODE_ENV=production` 时启用）

- **敏感页面路由（附加 no-store）**
  - 适用范围：
    - `/:locale/auth/:path*`（登录/注册/重置密码等）
    - `/:locale/dashboard/:path*`
    - `/:locale/settings/:path*`
    - `/:locale/admin/:path*`
  - 附加头：
    - `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate`

- **API 路由（附加 no-store）**
  - 适用范围：`/api/:path*`（包括 `/api/auth/[...all]`、Payment/Billing/Credits/Storage 等接口）
  - 附加头：
    - `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate`

> 说明：
> - 静态资源（`/_next/static/*` / `public/*`）仍然使用 Next/Vercel 的默认缓存策略；
> - CSP 默认允许 `https:` 资源，具体第三方清单由项目使用方视实际集成（GA/Umami/Crisp/Stripe/Creem 等）按需收紧。

## Storage 上传魔数校验

- 入口：`src/app/api/storage/upload/route.ts`
- 现有安全措施：
  - 登录校验（`ensureApiUser`）；
  - 速率限制（`enforceRateLimit(scope: 'storage-upload')`）；
  - 单文件大小限制（10MB）；
  - MIME 白名单：`['image/jpeg', 'image/png', 'image/webp']`；
  - 目标路径校验：根目录白名单 + `SAFE_FOLDER_REGEX` + 自动附加 `userId`。
- 新增魔数校验：
  - 对允许的图片类型进行魔数校验，仅在 `file.type` 属于白名单时执行：
    - `image/png`：检查 PNG 标准 8 字节魔数；
    - `image/jpeg`：检查起始 3 字节 `FF D8 FF`；
    - `image/webp`：检查前 4 字节 `RIFF` 以及偏移 8-12 字节 `WEBP`。
  - 任意魔数不匹配 → 视为 `StorageUnsupportedType`，返回 400 + envelope：
    - `{ success: false, error: 'File type not supported', code: ErrorCodes.StorageUnsupportedType, retryable: false }`
  - 相关测试：`src/app/api/__tests__/storage-upload-route.test.ts` 调整 `createMultipartRequest`，在 `image/png` 场景构造包含合法 PNG 头的 Blob。

## Better Auth 会话与 ExternalAccessProvider 不变式

- Better Auth 会话与 Cookie：
  - 配置入口：`src/lib/auth.ts`
  - 不变式：
    - 在生产环境下，Better Auth 默认使用 `httpOnly + secure + SameSite=Lax` 会话 Cookie（前提是 `baseURL` 为 HTTPS）；
    - 所有受保护的 Server Actions / API Routes 必须在服务端验证会话（例如使用 `ensureApiUser`），**仅凭 session cookie 存在不得视为已授权**；
    - `getSessionCookie` 仅用于 middleware 层的乐观重定向，而不能提供最终授权结论。

- ExternalAccessProvider（Creem Phase B-Plugin）：
  - 接口定义：`src/lib/auth-domain.ts`
    - `type AccessCapability = 'plan:*' | 'feature:*'`
    - `ExternalAccessProvider.hasAccess(userId, capability)` 仅允许 `feature:*` 能力；
  - Creem 实现：`src/lib/server/creem-external-access-provider.ts`
    - 仅在 `CREEM_BETTER_AUTH_ENABLED=true` 且配置了 Creem API Key 时启用；
    - 通过 Better Auth Creem 插件 Database Mode 提供的本地视图解析 `feature:creem:any-subscription` 等能力；
    - 对非 `feature:*` 能力一律返回 `false`，`plan:*` 能力只由本地 Billing/Credits/Membership 决定；
    - 任意错误/超时仅记录日志并返回 `false`（fail-closed），不得授予访问能力。

## 结束条件

- 所有响应路径已经应用全局安全头基线，敏感页面与 API 响应增加 `no-store` 级缓存控制；
- Storage 上传接口对允许的图片类型执行魔数校验，相关单元测试通过；
- Better Auth 会话与 ExternalAccessProvider 的安全不变式已经在代码与文档中清晰表达，并在今后扩展时遵守：
  - 计费事实来源仍然仅限 Payment/Billing/Credits；
  - 外部访问视图只能作为授权判定的辅助信号，不能成为第二套计费/授权事实来源。

