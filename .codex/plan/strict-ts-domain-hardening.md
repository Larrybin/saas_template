# 严格 TS 域模型收紧计划（Phase 1：核心 Domain）

## 背景

- 已启用 TypeScript 严格模式：`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`。
- Biome 已收紧：`noExplicitAny`, `noUnused*`, `noNonNullAssertion` 等为 error。
- 运行 `pnpm exec tsc --noEmit` 时，暴露大量与 `string | undefined`、可选属性、第三方库类型不匹配相关的问题。

## 目标

- 在严格 TS 配置下，使「核心 domain」代码（env/config/auth/payment/credits/mail/actions/API routes 等）完全通过编译。
- 保持业务语义正确，不通过到处放宽类型或滥用 `any` 规避问题。
- 将「不可避免的断言」集中在边界层（第三方 SDK / 底层封装），避免污染业务模型。

## 分阶段计划（Domain 层）

### 阶段 A：配置 / env / scripts 收紧

1. 更新 `playwright.config.ts`：
   - 使用条件展开添加 `webServer`，避免 `webServer: TestConfigWebServer | undefined` 直接赋给配置类型。
2. 收敛 env 与脚本：
   - 在 `src/env` 封装中确保导出 env 的类型为 `string` 或 `string | null`，消除直接使用 `process.env.*` 导致的 `string | undefined` 问题。
   - 更新 `scripts/list-contacts.ts`、`src/lib/server/rate-limit.ts` 等使用 env 的脚本/模块。

### 阶段 B：用户与权限模型（auth / admin / safe-action / hooks）

3. 定义应用级用户类型 `AppUser`：
   - 在 `src/lib/auth-types.ts`（或等效位置）基于 Better Auth 的 `User` 扩展 `role`, `banned`, `banReason`, `banExpires`, `customerId`。
4. 对齐 better-auth 配置与 client 类型：
   - 在 `auth.ts` 中通过 `additionalFields`/插件配置反映扩展字段。
   - 在 `auth-client.ts`、`use-users.ts`、admin 组件中统一使用 `AppUser`，并集中封装 admin 插件类型断言。

### 阶段 C：Credits / Payment / Mail 核心域

5. Credits 域：
   - 统一将 `expireDays`, `paymentId`, `periodKey` 等建模为真正可选属性（`?: T`），同步修正调用处构造 payload 的方式。
6. Payment 域（Stripe provider & service）：
   - 对 Stripe params 使用条件展开构造严格对象，避免将 `T | undefined` 直接赋给 `T`。
   - 对 `Subscription` 映射类型进行精化，使 `currentPeriodStart` 等字段的类型与使用方式一致（必要时在类型上标记为可选）。
7. Actions 层：
   - 在 `create-customer-portal-session.ts`、`get-credit-transactions.ts`、`get-users.ts` 中增加显式 null-check 与默认值，避免 `Object is possibly 'undefined'` / `Property 'count' does not exist on type ... | undefined`。
8. Mail 域（模板与 Resend provider）：
   - 引入 `TemplateMap` 形式的模板→上下文映射，去掉跨所有模板的大交叉类型。
   - 保证 Resend 调用参数中 `text`, `locale` 等可选字段以「字段可选 + 值为严格类型」的方式使用。

### 阶段 D：AI 文本 / 图像分析域

9. Web 内容分析状态建模：
   - 将 `AnalysisState`、`AnalysisResultsProps` 中的 `screenshot` 统一为可选或 `string | null`，消除 `string | undefined` 与 `string` 的不匹配。
10. Firecrawl 客户端配置：
   - 确保 `apiKey` 类型与 SDK 的 `string | null` 要求一致，在 env 封装层处理 `undefined`。

### 阶段 E：SEO & docs / marketing 元信息

11. 修正 legal/docs/blog 等页面的 SEO helper 调用：
   - 统一处理 `description` 字段为可选属性或提供非空默认值。
12. Docs layout / page 组件：
   - 对 `Comp`、`DocsPageProps.full`、`BaseLayoutProps.i18n` 等字段进行类型与使用方式对齐（可选或提供 fallback）。

### 阶段 F：API routes / storage / rate-limit

13. API routes：
   - 对使用 env 的代码添加 guard 或默认值，避免不安全的 `string | undefined` 传递。
14. Storage 配置：
   - 将 `endpoint`, `publicUrl`, `folder` 等配置建模为可选属性，并在使用前显式 narrow。

### 阶段 G：核心测试修复

15. Credits / user-lifecycle 相关测试：
   - 使用更严格的 expect/narrow 策略，消除测试中 `Object is possibly 'undefined'` 等错误。

## 执行策略

- 按阶段 A → G 顺序推进，每完成一批文件后运行 `pnpm exec tsc --noEmit`，增量消除错误。
- 业务模型优先：宁可在边界集中使用断言，也不在核心类型上随意引入 `| undefined`。
- 完成本阶段后，再单独为 UI/动效层制定类似分阶段计划。

## 当前进展（2025-11，节选）
- Credits / Payment 域：
  - `CreditsTransaction` 已在 `src/credits/services/transaction-context.ts` 中收紧为强类型的 `DbExecutor` 包装，移除 `unknown` + 泛型解包方式；`resolveExecutor` 返回值类型明确为 `DbExecutor | undefined`，避免上层误用。
  - `CreditLedgerDomainService` 中对 repository 结果的使用均通过明确的可选链与默认值处理（如 `record?.currentCredits ?? 0`），并配合 repository 接口抽象消除直接使用 Drizzle schema 的地方。
  - `StripeCheckoutService`/`SubscriptionQueryService`/`CustomerPortalService` 中与 Stripe SDK 的交互使用条件展开构造请求对象，并在类型上对 `currentPeriodStart`/`trialEndDate` 等字段建模为可选，保持映射与使用方式一致。
- Domain Error & Actions：
  - 新增 `DomainError` 基类（`code` + `retryable`），`PaymentSecurityError`、Credits 域的 `InvalidCreditPayloadError`/`InsufficientCreditsError` 等全部继承自该类，消除散落的裸 `Error` 字符串常量。
  - `safe-action` 的 `handleServerError` 针对 `DomainError` 提供统一返回结构（`{ success: false, error, code, retryable }`），前端 hooks/组件可以在严格 TS 下安全读取错误信息而不依赖 `any`。
