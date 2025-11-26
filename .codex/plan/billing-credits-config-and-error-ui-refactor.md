# 中期重构计划：计费/积分配置适配层 & 错误 UI 策略统一

## 一、背景与目标

- 背景：
  - 计费与积分相关配置当前分布于多个模块：`websiteConfig`（`src/config/website.tsx`）、`src/credits/config.ts`、`src/ai/billing-config.ts`、`src/lib/price-plan.ts` 等，调用方往往直接耦合到这些实现细节。
  - 前端错误 UI 已有多个领域专用 hook（`use-ai-error-ui`, `use-credits-error-ui`, `use-auth-error-handler` 等），但错误 code → UI 行为（toast 级别、跳转、引导动作）仍存在少量散落逻辑。
- 本轮目标（P1）：
  1. 抽象一层“计费/积分配置适配层”，为 Billing / Credits / AI usecases 提供稳定的只读接口，减少对 `websiteConfig` 等底层配置的直接耦合。
  2. 构建一个统一的“错误 UI 策略 registry”，集中管理 `code → 严重级别 → 文案 key → 默认行为` 映射；各领域 hook 只消费该 registry，避免重复 if/else。

---

## 二、范围

- 包含：
  - 配置适配层：
    - `src/config/website.tsx`
    - `src/credits/config.ts`
    - `src/ai/billing-config.ts`
    - `src/lib/price-plan.ts`
    - 依赖上述模块的 Billing/Credits/AI usecases：
      - `src/domain/billing/**/*`
      - `src/lib/server/usecases/*with-credits.ts`
      - `src/credits/domain/*` / `src/credits/services/*`
  - 错误 UI 策略：
    - `src/hooks/use-ai-error-ui.ts`
    - `src/hooks/use-credits-error-ui.ts`
    - `src/hooks/use-auth-error-handler.ts`
    - `src/lib/domain-error-utils.ts`
- 不包含：
  - 改变计费/积分规则本身（额度、周期、免费额度等）。
  - 新增大规模 UI 功能（例如复杂错误详情面板），本轮只做“策略集中 + hook 收敛”。

---

## 三、任务 A：计费/积分配置适配层

### A1. 梳理现有配置读取路径

- 目标：列出所有“直接读取配置”的关键调用点，为后续收敛提供依据。
- 操作要点：
  - 在以下模块中搜索 `websiteConfig`、`PlanCreditsConfig`、`getPlanCreditsConfigByPriceId` 等关键字：
    - `src/domain/billing/billing-service.ts`
    - `src/credits/config.ts`
    - `src/ai/billing-config.ts`
    - `src/lib/price-plan.ts`
  - 输出一个简单的映射清单（可贴在本文件结尾）：
    - 领域调用点（billing/credits/AI usecases） → 当前读取的配置字段（如 `websiteConfig.credits.enableCredits`, `plan.creditsConfig` 等）。

### A2. 设计适配层接口（Config Facade）

- 目标：定义一个窄口径的“定价/积分配置”接口，供领域层调用，而不感知底层配置来源。
- 建议接口（示例，最终以实现时实际需要为准）：
  - 新增模块（建议之一）：`src/lib/pricing-config.ts` 或 `src/config/pricing-credits.ts`
  - 可能导出的方法：
    - `getCreditsGlobalConfig(): { enableCredits: boolean; /* ...扩展字段 */ }`
    - `getPlanCreditsConfig(planId: string): PlanCreditsConfig | null`
    - `getPlanCreditsConfigByPriceId(priceId: string): PlanCreditsConfig | null`
    - `getAiUsageBillingRule(feature: 'chat' | 'analyze' | 'image'): { creditsPerCall: number; freeCallsPerPeriod?: number }`
  - 适配层内部：
    - 负责从 `websiteConfig`, `src/lib/price-plan.ts`, `src/credits/config.ts`, `src/ai/billing-config.ts` 组合/整合配置。
    - 对外暴露的类型应尽可能简单、只读，避免将底层结构透传给领域层。

### A3. 渐进迁移领域调用方

- 目标：Billing / Credits / AI usecases 不再直接依赖底层配置模块，而是依赖配置适配层。
- 操作要点：
  - 逐个替换以下位置的配置读取逻辑：
    - `src/domain/billing/billing-service.ts`
      - 使用 `getPlanCreditsConfigByPriceId` / `getCreditsGlobalConfig` 代替直接依赖 `planPolicy`/`websiteConfig.credits?.enableCredits`（可视情况将 `planPolicy` 实现迁移到适配层内部或保持当前职责划分）。
    - `src/ai/billing-config.ts`
      - 将 AI 计费配置搬迁/重构为适配层中的一个实现细节，或至少由适配层统一读取。
    - `src/credits/config.ts`
      - 确保 Credits 不直接读取 `websiteConfig`/`price-plan`，而是通过统一的配置视图获取所需字段。
  - 对于暂时无法迁移的调用点，可在适配层中提供过渡函数，避免产生新的 `websiteConfig` 直接引用。

### A4. 清理冗余与文档更新

- 目标：在完成迁移后，清理不再使用的配置拼装逻辑，并同步文档。
- 操作要点：
  - 清理：
    - 检查 `src/credits/config.ts` / `src/ai/billing-config.ts` 中是否有当前无人调用的 helper，考虑删除或标记为 deprecated（仅限内部使用）。
  - 文档：
    - 在 `docs/architecture-overview.md` 或 `docs/feature-modules.md` 中补充一小节，说明：
      - “定价/积分配置”通过单一适配层提供；
      - 领域模块不再直接依赖 `websiteConfig`。

### A5. 验证

- 执行命令：
  - `pnpm lint`
  - `npx tsc --noEmit`
  - `pnpm test`
- 关注点：
  - Billing / Credits / AI usecases 单测是否全部通过。
  - 无新增循环依赖（Config Facade 应位于较低层，只依赖 config/env，而不反向依赖 domain）。

---

## 四、任务 B：错误 UI 策略统一（Error UI Registry）

> 为避免与前面的任务 A 混淆，错误 UI 策略任务编号从 B 开始。

### B1. 梳理现有错误 UI 处理逻辑

- 目标：查清所有“根据 code 决定 toast / 跳转 / 提示语”的代码位置。
- 操作要点：
  - 搜索以下文件：
    - `src/hooks/use-ai-error-ui.ts`
    - `src/hooks/use-credits-error-ui.ts`
    - `src/hooks/use-auth-error-handler.ts`
    - 以及任何直接使用 `code === 'XXX'` 的组件/Hook。
  - 整理一张表：
    - `code` → 使用场景 → 当前 UI 行为（toast 类型、文案 key、是否跳转）。

### B2. 设计错误 UI 策略 registry

- 目标：在一个集中模块中描述“错误码 → UI 策略”，供各领域 hook 复用。
- 建议实现：
  - 新增模块：`src/lib/domain-error-ui-registry.ts`（名称可调整）
  - 核心结构示例：
    ```ts
    export type ErrorUiSeverity = 'info' | 'warning' | 'error';

    export type ErrorUiStrategy = {
      severity: ErrorUiSeverity;
      messageKey?: string; // i18n key，如 'Common.unauthorized'
      defaultFallbackMessage?: string;
      action?: 'redirectToLogin' | 'openCreditsPage' | 'none';
      source?: 'ai' | 'credits' | 'auth' | 'generic';
    };

    const ERROR_UI_STRATEGIES: Record<string, ErrorUiStrategy> = {
      AUTH_UNAUTHORIZED: {
        severity: 'warning',
        messageKey: 'Common.unauthorized',
        action: 'redirectToLogin',
        source: 'auth',
      },
      CREDITS_INSUFFICIENT_BALANCE: {
        severity: 'warning',
        messageKey: 'Dashboard.settings.credits.balance.insufficientCredits',
        action: 'openCreditsPage',
        source: 'credits',
      },
      // AI_CONTENT_* / AI_IMAGE_* 等可按需补充
    };

    export function getErrorUiStrategy(code?: string): ErrorUiStrategy | null {
      return code ? ERROR_UI_STRATEGIES[code] ?? null : null;
    }
    ```
  - 该模块不依赖具体 UI 库（不直接调用 `toast` 或 router），只描述策略。

### B3. 收敛领域专用 hooks 到 registry

- 目标：`use-ai-error-ui`, `use-credits-error-ui`, `use-auth-error-handler` 等 hooks 统一通过 registry 获取策略，减少重复逻辑。
- 操作要点：
  - 在每个 hook 中：
    - 引入 `getErrorUiStrategy`。
    - 逻辑改为：
      - 根据 `error.code` 获取策略；
      - 使用策略中的 `severity` 选择 `toast.info` / `toast.warning` / `toast.error`；
      - 使用 `messageKey` + `getDomainErrorMessage` + `next-intl` 生成提示文案；
      - 根据 `action` 执行路由跳转（例如 `redirectToLogin` → 使用已有的 `Routes.Login` + locale 路由工具）。
  - 保留各 hook 的领域特化逻辑（如 AI 源区分 `source: 'text' | 'image'` 的细节），但避免在多个 hook 中重复写 `if (code === 'AUTH_UNAUTHORIZED')`。

### B4. 扫描并替换散落判断逻辑

- 目标：消除组件/Hook 中“孤立的 code 判断逻辑”。
- 操作要点：
  - 搜索代码中 `code === 'AUTH_UNAUTHORIZED'`、`code === 'CREDITS_INSUFFICIENT_BALANCE'`、`code === 'AI_CONTENT_...'` 等片段。
  - 尽量将这些逻辑迁移到：
    - 错误 UI registry（策略层）；
    - 或相应领域 hook 中（作为集中入口）。
  - 对于确实只在单一组件内使用且行为极为特化的 case，可以保留，但需在代码中明确注释为何不走统一策略（避免未来误以为遗漏）。

### B5. 文档与验证

- 文档：
  - 在 `docs/error-logging.md` 或单独新增一节“前端错误 UI 策略”，简要说明：
    - `code` → i18n 文案 key 的映射。
    - `code` → UI 行为（toast/跳转）的集中管理方式。
  - 将 Error UI registry 作为“前端错误消费层”的核心入口在文档中露出。
- 验证：
  - 手动回归典型场景：
    - 未登录访问受保护资源 → toast + 跳转登录。
    - 积分不足 → toast + 引导到 Credits 设置页。
    - AI 文本/图片请求错误（例如网络错误、timeout） → 观察 toast 类型与文案是否符合预期。

---

## 五、原则与注意事项

- KISS：
  - 配置适配层只做“读取与整合配置”的工作，不引入复杂的运行时重载或动态下发逻辑。
  - 错误 UI registry 仅描述策略，不耦合具体 UI 框架或组件。
- YAGNI：
  - 不提前为所有潜在错误码设计 UI 策略，先覆盖 Credits/Billing/AI/Auth 高频错误即可。
  - 不在本轮引入多租户配置、AB 实验等高级需求，保持接口简单。
- DRY：
  - 避免在多个领域模块中重复读取/拼装相同配置。
  - 避免在多个 hook/组件中重复基于 `code` 的 if/else 判断。
- SOLID：
  - 配置适配层作为单一职责模块，只服务于“提供稳定配置视图”，不承担业务决策。
  - 错误 UI registry 作为“策略提供者”，具体执行仍由各领域 hook/组件负责，保证可替换性与扩展性。

