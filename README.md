# SaaS Template

Production-ready Next.js boilerplate for building modern SaaS products.

SaaS Template 提供一套开箱即用的 SaaS 脚手架，包括鉴权、支付、国际化、仪表盘、博客、文档、主题、SEO 等常见能力，帮助你在最短时间内交付可上线的产品。

## Overview

SaaS Template is an opinionated starter kit for building SaaS applications with:

- Next.js App Router + TypeScript
- Auth, payments and billing
- i18n, blog, docs and marketing pages
- Dashboard UI, themes and SEO

它更关注“能快速上线的实用模板”，而不是框架实验场。

## Features

- Next.js App Router with React Server Components
- TypeScript-first codebase with strict checks
- Better Auth 集成与可扩展的用户生命周期 hooks
- Stripe 支付与积分/订阅计费封装
- Drizzle ORM 与 schema-first 数据库迁移
- Tailwind CSS 设计系统与主题支持
- Newsletter 集成与邮件模板
- Vitest 单元/集成测试与 Playwright 端到端测试
- Server / Client 环境变量强类型校验

## Project Structure & Architecture

### Directory layout

```text
.
├─ src/
│  ├─ actions/       # Next.js Server Actions，封装常用服务端操作
│  ├─ ai/            # AI 能力（chat / image / text 场景与组件）
│  ├─ analytics/     # 分析与埋点相关集成
│  ├─ app/           # Next.js App Router 路由与页面（RSC + 客户端组件）
│  ├─ assets/        # 内部使用的静态资源
│  ├─ components/    # 共享 UI 组件
│  ├─ config/        # 站点配置（SEO、主题、导航、社交链接等）
│  ├─ credits/       # 积分与用量计费相关逻辑
│  ├─ db/            # Drizzle schema 与数据库访问封装
│  ├─ env/           # 环境变量 schema 与类型安全访问
│  ├─ hooks/         # React hooks
│  ├─ i18n/          # 国际化配置与工具
│  ├─ lib/           # 领域无关工具函数与跨模块服务
│  ├─ mail/          # 邮件模板与发送逻辑
│  ├─ newsletter/    # Newsletter 订阅与退订逻辑
│  ├─ notification/  # 站内/站外通知封装
│  ├─ payment/       # 支付与订阅/积分计费域（服务、仓储、Stripe provider）
│  ├─ proxy/         # 代理与中间层逻辑（如 Better Auth、后端 API）
│  ├─ storage/       # 对象存储抽象（S3 等）
│  ├─ stores/        # 全局状态管理（例如 locale-store）
│  ├─ styles/        # 全局样式与 MDX 样式
│  └─ types/         # 共享类型声明
├─ content/          # 博客、文档等 MD/MDX 内容
├─ messages/         # 多语言文案（i18n 字典）
├─ public/           # 静态资源（图片、favicon 等）
├─ tests/            # E2E 与其他测试
└─ types/            # 顶层全局类型声明（如 API / Env）
```

### Module relationships

- 路由与 UI 层：`src/app` 只负责页面与布局，复杂交互拆分到 `src/components`，数据与副作用通过 `src/actions`（Server Actions）或 `src/lib` / `src/payment` 等服务模块完成。
- 认证与用户生命周期：Better Auth 的配置与包装位于 `src/lib/auth.ts` 与 `src/lib/auth-domain.ts`；用户创建后的后置行为（发放积分、订阅 Newsletter 等）由 `src/lib/user-lifecycle` 统一管理，通过 `UserLifecycleManager` 注入不同的生命周期 hook。
- 支付与计费：页面或 API 路由通过 `import * as payment from '@/payment'` 访问支付域；`src/payment/services/stripe-payment-service.ts` 作为领域服务，直接封装 Stripe SDK，并依赖 `src/payment/data-access/*`（读写数据库与 Stripe 事件表）；Stripe Webhook 入口位于 `src/app/api/webhooks/stripe/route.ts`，仅负责解析请求并转交给支付服务。
- 积分与用量：与支付服务解耦的积分逻辑集中在 `src/credits` 与部分 `src/payment` 服务中，UI 通过 `src/actions` 暴露的接口来查询余额、消费积分与查询交易记录。
- 存储与上传：`src/storage/index.ts` 提供统一的存储客户端，按配置选择具体 provider（例如 `src/storage/provider/s3.ts`），业务代码不直接依赖第三方 SDK，便于后续更换存储服务。
- 内容与多语言：静态内容（博客、文档等）存放在 `content/`，运行时多语言文案通过 `messages/` 加载，配合 `src/i18n` 进行解析与路由映射；页面通常通过 hooks/辅助函数读字典而不是硬编码文案。
- 代理与中间件：`src/proxy.ts` 与 `src/proxy/helpers.ts` 封装了与 Better Auth 会话、上游 API 等相关的代理逻辑，Edge Middleware 层只依赖这些 helper 做轻量级 Cookie 检查与重定向，避免在边缘层直接耦合业务逻辑。

## Getting Started

### Prerequisites

- Node.js（建议使用 LTS）
- `pnpm` 包管理器
- 可用的 Postgres 数据库
- Stripe 账号与 API Key（如果启用支付）

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

本地启动后默认访问 `http://localhost:3000`。

### Production build

```bash
pnpm build
pnpm start
```

## Quality Gates

- `pnpm lint` – 静态分析（Biome）与格式检查。
- `pnpm test` – 基于 Vitest 的单元/集成测试。
- `pnpm test:e2e` – Playwright 登录冒烟测试（需要将 `PLAYWRIGHT_ENABLE=true` 且 `PLAYWRIGHT_BASE_URL` 指向已运行的应用）。

以上命令应在本地与 CI 环境中全部通过后再合并。

> Windows PowerShell 对 `pnpm exec tsc --noEmit` 存在 `/d` 解析问题，遇到报错时可直接改用 `npx tsc --noEmit`，行为一致但可绕过此限制。

## Environment Configuration

- 运行时配置通过 `src/env/server.ts` 与 `src/env/client.ts` 进行校验，缺失或错误配置会在启动/构建时直接抛出错误。
- 使用封装好的 helper 访问环境变量，而不是直接读取 `process.env`：
  - 服务端代码：`import { serverEnv } from '@/env/server'`
  - 客户端 / 共享代码：`import { clientEnv } from '@/env/client'`
- `.env.example` 列出了所有支持的变量。根据环境复制为 `.env.local`（或其他环境文件），填入所需的机密配置后再执行 `pnpm build` 或部署。
- 若希望在生产环境强制依赖 Upstash Redis，可设置 `RATE_LIMIT_REQUIRE_REDIS=true`；默认值为 `false`，会在 Redis 缺失时回退到进程级内存桶并输出警告日志。

## Architecture Notes

- **Client logging policy**: 前端代码（组件、hooks 等）禁止直接调用 `console.*`。请统一通过 `src/lib/client-logger.ts` 暴露的 `clientLogger.debug/info/warn/error` 输出，便于未来集中接入 Sentry/LogRocket 等监控服务，并避免在生产环境泄露敏感信息。Code Review 会以此为准；如确需保留 CLI/脚本级 `console`，请在说明中注明用途。
- 站点基础信息与社交链接配置位于 `src/config/website.tsx` 的 `metadata.social` 字段。请替换为你自己的域名与社交账号，或删除不需要的条目。
- 用户生命周期逻辑集中在 `src/lib/user-lifecycle`：
  - Better Auth 的 `databaseHooks.user.create.after` 通过此模块触发。
  - 默认会包含如 Newsletter 自动订阅与注册奖励等逻辑。
  - 如需扩展或在测试中替换行为，可实现自定义 `UserLifecycleHook` 并在创建 `UserLifecycleManager` 时注入。
  - 相关 Vitest 示例位于 `src/lib/user-lifecycle/__tests__/user-lifecycle-manager.test.ts`。
- Edge Middleware 仅做基于 Cookie 的轻量检查：
  - 调整 matcher 或重定向前后，建议在 CDN/APM 中对比 P50/P95 延迟。
  - 保留一份基准数据，便于评估变更的影响。

## Payments

- Stripe Checkout 的 `priceId` 始终由服务端决定，前端仅提交 `packageId` / `planId`。
- 服务端 helper（例如 `createCreditCheckout` / `createCheckout`）会将这些 ID 映射为合法的 Stripe `priceId`，并拒绝任何与配置不符的请求。
- 调整价格或套餐时，请同步更新服务端配置，避免遗留旧的 `priceId`。
- Stripe Webhook 处理推荐：
  - 针对单个 `event_id` 使用数据库事务与加锁（幂等处理）。
  - 为重复事件记录跳过日志，确保每个事件只生效一次。
- `expireDays` 省略或设置为 `undefined/0` 表示“不过期”；开启自动过期时需设置为正整数。积分 FIFO 会优先扣除即将到期的额度。

## Testing

- 单元/集成测试：`pnpm test`
- 覆盖率报告：`pnpm test:coverage`
- 端到端浏览器测试：`pnpm test:e2e`（需要运行中的应用与 Playwright 配置）

## Contributing

欢迎通过 Issue 与 Pull Request 提交 Bug 反馈与功能建议。提交前建议本地确保：

- 代码通过 `pnpm lint`
- 测试通过 `pnpm test`（以及必要时的 `pnpm test:e2e`）

## License

本项目的许可证信息详见 `LICENSE` 文件。
