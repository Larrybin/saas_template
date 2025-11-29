---
title: 认证与权限控制最佳实践
description: 基于 MkSaaS 模板、Next.js App Router 与 better-auth 的认证与权限设计规范
---

## 适用范围

- Next.js App Router 全栈应用（`src/app`）
- better-auth 认证系统（`src/lib/auth.ts`、`src/app/api/auth/[...all]`）
- 所有依赖用户身份、角色、订阅计划或 Credits 的业务模块（如 `src/ai/*`、`src/credits/*`、`src/payment/*`）

## 设计目标

- 单一认证来源：所有 API / 页面只从 better-auth 与统一的 server helper 读取身份。
- 清晰权限边界：路由层只做“是否允许访问”的二元决策，业务细粒度控制放在 domain/usecase。
- 易于扩展：支持按订阅计划、角色、Feature Flag 组合授权，而无需侵入各业务模块。

## 核心原则

1. **认证入口单一**
   - 所有需要登录的 API Route 使用统一 helper，例如：
     - `ensureApiUser(request)`（位于 `src/lib/server/api-auth`）。
     - 只允许从该 helper 读取 `userId`、plan、banned 状态等。
   - 所有需要登录的页面/布局，通过 better-auth 的 server 端 API 或 proxy 中央化处理：
     - 避免在各个组件中重复读取 cookie 或解析 session。

2. **授权与业务解耦**
   - 路由层只负责“粗粒度授权”：
     - 是否已登录。
     - 账号是否被封禁。
     - 请求是否来自内部 job（如 Basic Auth 的 cron）。
   - 细粒度授权（是否可以使用某 AI 功能、是否可以访问某团队资源）放在 domain/usecase 层：
     - 例如 `src/domain/billing/*`、`src/credits/*`、`src/lib/server/usecases/*`。

3. **拒绝访问的统一行为**
   - API 层：
     - 认证失败：统一返回 JSON envelope 或明确标记为 cron / webhook 特例（参考 `unify-api-envelope-and-errors` 计划）。
     - 被封禁用户：统一错误码、统一 i18n key（如 `Common.accountBanned`）。
   - 页面层：
     - 未登录：重定向到登录页，并带上 `redirectTo` 查询参数。
     - 被封禁：重定向到统一的“账号被封禁”说明页，避免散落在各页面内。

4. **基于 better-auth 的能力建模**
   - 充分利用 better-auth 的：
     - 会话策略（过期、刷新、cookie 缓存）。
     - 数据库 hooks（例如用户创建后发放欢迎 Credits、同步 profile）。
     - 插件（admin 插件用于封禁用户、管理额外字段）。
   - 在 `src/lib/auth.ts` 中添加/维护扩展字段，而不是在业务模块里直接扩展 user 对象。
  - 回调与重定向 URL：
    - 所有登录/认证相关的回调路径必须通过已有 helper 构造：
      - Proxy / 登录入口使用 `buildSafeCallbackUrl(nextUrl)`，仅允许站内相对路径，并进行编码。
      - 邮件中的回调 URL 使用 `getUrlWithLocaleInCallbackUrl(url, locale)`，在现有安全 URL 基础上附加 locale 前缀。
    - 禁止在任意 Action / API / 组件中手写 `'?callbackUrl=' + someUrl` 这类字符串拼接逻辑，也不得直接信任客户端传入的完整 URL。
    - 如确需支持自定义回调参数，必须在服务端严格校验并转换为站内相对路径，再交给上述 helper 统一处理。
  - Auth 错误展示规范：
    - UI 层展示认证相关错误时，必须通过错误码 + i18n 映射生成用户可见文案（例如复用 `getDomainErrorMessage`、`useAuthErrorHandler` 等已有 helper），保持文案统一可控。
    - 禁止在前端直接使用后端返回的 `error.message` 作为 toast / banner / dialog 文案，也不得将原始错误对象序列化后暴露给终端用户。
    - 如需排查底层错误信息，应通过受控的开发日志、调试开关或内部工具查看，而不是在生产环境的用户界面中直接展示。

5. **最小开放原则**
   - 服务端导出给前端使用的 user 类型应是“瘦身版”：
     - 仅包含 UI 需要显示的信息（名称、头像、plan、可用 Credits）。
     - 不暴露敏感字段（如 internal flags、风控标记）。

## 实践要点（结合本仓库）

1. API route 侧
   - `src/app/api/chat/route.ts`、`generate-images/route.ts`、`analyze-content/route.ts`、`storage/upload/route.ts`：
     - 首行统一调用 `ensureApiUser(req)`。
     - 授权失败统一早返回 `authResult.response`。
   - `src/app/api/distribute-credits/route.ts`：
     - Basic Auth 明确作为“内部 job 特例”，不与公共 JSON API 的 401 行为混用。
   - `src/app/api/auth/[...all]/route.ts`：
     - 只作为 better-auth handler 的薄封装，不在 route 内写业务逻辑。

2. 页面与组件侧
   - 布局组件（`src/app/[locale]/(protected)/*`）：
     - 使用 server 端获取当前用户并在布局层决定“是否允许渲染 children”。
     - 避免在子组件中做重复的“是否登录”判断。
   - UI 组件（如 `src/components/dashboard/sidebar-user.tsx`）：
     - 只依赖已过滤的 `User` 类型（来自 better-auth），并在必要时做 null 兜底。

3. 角色 / 计划 / Feature Flag
   - 对“只读配置”领域（如计划列表、Feature Flag 配置）：
     - 放在 `src/config` 或 `src/domain/plan` 下集中维护。
   - 在 usecase 中组合判断：
     - 例如：`if (!canUseImageGeneration(user.plan, featureFlags)) throw new DomainError(...)`。

## 反模式（应避免）

- 在任意组件/route 代码中直接读取 cookie/token，而绕过 better-auth。
- 在多个 API route 中手写重复的“是否登录”逻辑，而不用统一 helper。
- 在前端根据 `user.role === 'admin'` 直接控制关键安全行为，而没有服务端校验。
- 在页面组件里混杂大量权限判断，使视图逻辑难以维护。

## Checklist

- [ ] 所有需要身份的 API route 都统一使用 `ensureApiUser`。
- [ ] 所有权限决策都能在少数集中模块（domain/usecase）中找到来源。
- [ ] 认证失败 / 被封禁的 API 与页面行为在文档中有统一说明。
- [ ] 不存在绕过 better-auth 的临时 token / cookie 解析逻辑。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/lib/auth.ts` 使用 better-auth 作为统一认证入口，并集中配置 session / provider / databaseHooks。
  - [x] AI 相关 API（`/api/chat`、`/api/generate-images`、`/api/analyze-content`、`/api/storage/upload`）统一通过 `ensureApiUser` 获取用户并返回标准 JSON envelope 的 401/403。
  - [x] 内部任务路由 `/api/distribute-credits` 采用 Basic Auth 作为明确标记的 cron 特例，而非复用公共用户认证。
- 尚待调整 / 确认
  - [ ] 其它需要鉴权的业务 API（如未来新增业务模块）是否全部复用 `ensureApiUser`，避免各自实现自定义鉴权逻辑。
  - [ ] `[locale]/(protected)` 下的布局是否统一封装 server 端 auth guard，确保子页面无需再重复做“是否登录”判断。
  - [ ] 被封禁用户在所有受保护页面中的体验是否统一（例如统一跳转到“账号被封禁”说明页，而不是在局部组件中零散处理）。
