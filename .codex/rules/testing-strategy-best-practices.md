---
title: 测试策略与测试金字塔最佳实践
description: 基于 MkSaaS 模板的单元 / 集成 / E2E 测试策略规范
---

## 适用范围

- 单元 / 集成测试：Vitest（`vitest.config.ts`、`vitest.setup.ts`、`src/**/*.test.ts(x)`）
- 端到端测试：Playwright（`playwright.config.ts`、`tests/e2e/*`）
- 测试策略文档：`docs/testing-strategy.md`

## 设计目标

- 用尽量少但高价值的测试覆盖关键业务路径（AI、Credits、Billing、Auth）。
- 明确单元 / 集成 / E2E 的职责边界，避免重复与测试金字塔倒置。
- 测试结构与目录划分清晰，便于新特性快速补齐测试。

## 核心原则

1. **测试金字塔**
   - 底层：单元测试（数量最多）：
     - 纯函数、领域服务、Repository 等。
   - 中层���集成测试：
     - usecase + 基础设施的局部集成（如 Credits + Billing、AI + Credits）。
   - 顶层：E2E 测试（数量有限）：
     - 关键用户路径（注册登录、购买订阅、使用 AI 功能等）。

2. **就近放置测试**
   - 默认模式：
     - `foo.ts` 的单元/集成测试放在同目录下的 `foo.test.ts`。
   - 领域级聚合测试：
     - 放在对应领域的 `__tests__` 目录中（如 `src/domain/billing/__tests__`、`src/credits/services/__tests__`）。

3. **只测对外可观察行为**
   - 单元测试关注输入输出，不依赖内部实现细节。
   - 集成测试关注跨模块交互的最终效果（如 Credits 分发后用户余额变更）。
   - 避免为私有函数 / 细枝末节编写脆弱测试。

4. **测试作为文档**
   - 选取有代表性的场景（边界条件、异常路径）编写测试案例。
   - 保持测试命名清晰，便于作为“活文档”理解系统行为。

## 实践要点（结合本仓库）

1. Vitest 配置
   - `vitest.config.ts` + `vitest.setup.ts`：
     - 已配置 Node 环境与全局测试工具。
   - 目录中广泛存在 `__tests__` 与 `*.test.ts`：
     - 域：`src/domain/billing`、`src/domain/plan`。
     - Credits：`src/credits/domain`、`src/credits/services`、`src/credits/distribution`。
     - AI：`src/ai/text/utils`、`src/lib/server/usecases`。
     - API：`src/app/api/__tests__`。

2. 测试策略文档
   - `docs/testing-strategy.md`：
     - 已对单元/集成/E2E 的划分与重点模块进行了说明。

3. E2E 测试
   - `tests/e2e`（若已存在）：
     - 适合覆盖“注册+登录+订阅+使用 AI 功能”的端到端场景。

4. 外部 SDK 与适配层（Stripe / Next 等）
   - 出站依赖（调用第三方 SDK）：
     - 优先通过 Like 类型暴露有限能力，例如：
       - `StripeClientLike` = `Pick<Stripe, 'checkout' | 'billingPortal' | 'customers' | 'webhooks'>`。
     - 业务代码依赖 Like 类型，真实 SDK 实例在构造函数中注入，方便测试注入 stub。
   - 入站依赖（Webhook / 回调）：
     - 将第三方事件映射为内部 DTO，例如：
       - `StripeWebhookEventLike` / `StripeCheckoutSessionLike` / `StripeSubscriptionLike`。
     - Webhook handler 只依赖内部 DTO，不直接依赖 `Stripe.Event` 等大类型。
   - 测试约定：
     - 在测试中可以在 stub 构造点使用最小化的 `as unknown as` 将 `vi.fn()` 断言为 Like 类型的方法签名；
     - 避免在业务代码或测试逻辑中散落 `as any` / `as SomeSdkType`。
   - API Route：
     - 推荐使用统一的 Request helper，例如 `tests/utils/requests.ts` 中的 `createJsonPost(url, body)`；
     - Route handler 尽量声明为 `POST(req: Request)`，测试直接传入 `Request` 实例，无需 `req as any`。

## 反模式（应避免）

- 将所有行为都仅通过 E2E 测试覆盖，导致测试反馈慢且难以定位问题。
- 单元测试与集成测试重复覆盖同一路径，增加维护成本。
- 为了提高“覆盖率数字”而编写大量低价值或脆弱测试。
- 在测试中频繁使用 `as any` 或直接依赖第三方 SDK 的完整类型，而不是通过 Like 类型 + 适配层隔离。

## Checklist

- [ ] 核心领域（Auth、Billing、Credits、AI）均至少有单元 + 集成测试覆盖主要路径与关键失败场景。
- [ ] E2E 测试仅覆盖少量关键用户旅程，并保持稳定。
- [ ] 新增功能时，在 PR 中明确列出对应的测试类型与文件。
- [ ] 测试运行命令（`pnpm test`、`pnpm test:e2e`）在本地与 CI 中保持一致。
- [ ] 涉及外部 SDK（如 Stripe、Next Request）时，是否通过 Like 类型 + 适配层隔离，并在测试中仅依赖 DTO/Like 类型，而不是到处 `as any`。

## 实施进度 Checklist

- 已基本符合
  - [x] 仓库中已存在较为全面的 Vitest 测试覆盖，包括 Domain、Credits、AI usecase 与 API Route 等模块。
  - [x] `docs/testing-strategy.md` 已定义总体测试策略与重点模块，指导如何选择测试层级。
  - [x] `playwright.config.ts` 与 `tests/e2e`（若已填充）为端到端场景提供基础设施。
- 尚待调整 / 确认
  - [ ] 新增/修改核心业务逻辑（如 Credits / Billing / AI 路径）时，是否始终同步维护对应测试。
  - [ ] E2E 测试是否聚焦于“价值最高的少数场景”，而不是追求覆盖所有细节。
  - [ ] 是否在 CI 中强制执行关键测试命令（至少 `pnpm test`，必要时包含 `pnpm test:e2e`）。
