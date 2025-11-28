---
title: AI 计费规则策略化与配置解耦
description: 将 AI 计费规则从硬编码常量迁移到 websiteConfig/env，并通过 AiBillingPolicy 抽象提供给 usecase，以支持后续按 plan/区域/环境扩展。
---

## 背景

- 现状：
  - `src/ai/billing-config.ts` 中使用模块级常量 `aiBillingConfig` 硬编码 Chat/Text/Image 的计费规则。
  - Usecase（如 `execute-ai-chat-with-billing`、`generate-image-with-credits`）直接依赖这些常量，无法通过配置按 plan/区域/环境进行差异化。
  - 与 `.codex/rules/config-and-env-best-practices.md` 中“可变配置集中在 src/config、业务通过配置接口读取”的原则不一致。
- 目标：
  - 将 AI 计费规则统一收敛到 `websiteConfig` / env。
  - 引入 `AiBillingPolicy` 抽象，与 Credits 模块的 `PlanCreditsPolicy` 模式对齐。
  - 保持现有 usecase API 基本不变，通过适配层平滑迁移。

## 方案概述（方案 2，最小改造优先）

1. 在 `WebsiteConfig` 中增加 `ai.billing` 配置块，作为 AI 计费规则的集中配置源。
2. 新增 `AiBillingPolicy` 接口和 `DefaultAiBillingPolicy` 实现，从 `websiteConfig.ai.billing` 解析规则。
3. 将 `src/ai/billing-config.ts` 重写为策略适配器，对外继续暴露 `getAi*BillingRule`，对内委托策略实现。
4. Usecase 侧继续依赖 `getAi*BillingRule`，但实际规则来源已经解耦到配置 + 策略层。
5. 通过单元测试和文档更新，确保行为与架构说明同步。

## 执行步骤

### 1. 配置与类型扩展

- 修改 `src/types/index.d.ts`：
  - 在 `WebsiteConfig` 上新增 `ai?: AiConfig;` 字段。
  - 定义：
    - `AiConfig`：包含 `billing?: AiBillingConfig;`
    - `AiBillingConfig`：包含 `chat/analyzeContent/generateImage?: AiBillingRuleConfig;`
    - `AiBillingRuleConfig`：`enabled?`, `creditsPerCall?`, `freeCallsPerPeriod?`.
- 修改 `src/config/website.tsx`：
  - 在 `websiteConfig` 中新增：
    - `ai.billing.chat/analyzeContent/generateImage`，默认值：
      - `enabled: true`
      - `creditsPerCall: 1`
      - `freeCallsPerPeriod: 8`

### 2. 策略层实现

- 新增 `src/ai/billing-policy.ts`：
  - 定义：
    - `AiBillingRule`：领域内使用的标准计费规则结构。
    - `AiBillingFeature`：`'chat' | 'analyzeContent' | 'generateImage'`
    - `AiBillingEnvironment`：`'local' | 'preview' | 'production'`
    - `AiBillingContext`：`{ planId?, region?, environment? }`（预留未来扩展用）。
    - `AiBillingPolicy` 接口：`getChatRule/getAnalyzeContentRule/getImageRule`.
  - 实现 `DefaultAiBillingPolicy`：
    - 从 `websiteConfig.ai?.billing?.[feature]` 读取配置。
    - 对缺失字段使用默认值（与当前硬编码逻辑一致）：
      - `enabled: true`, `creditsPerCall: 1`, `freeCallsPerPeriod: 8`.
    - 暂不根据 `AiBillingContext` 分支，先满足集中配置 + 可扩展性。
  - 导出单例：
    - `export const defaultAiBillingPolicy: AiBillingPolicy = new DefaultAiBillingPolicy();`

### 3. 适配器层重写

- 修改 `src/ai/billing-config.ts`：
  - 删除原有 `AiBillingRule` 类型与 `aiBillingConfig` 常量。
  - 从策略层导入：
    - `import { type AiBillingRule, defaultAiBillingPolicy } from '@/ai/billing-policy';`
  - 重写导出函数：
    - `getAiChatBillingRule` → `defaultAiBillingPolicy.getChatRule()`
    - `getAnalyzeContentBillingRule` → `defaultAiBillingPolicy.getAnalyzeContentRule()`
    - `getImageGenerateBillingRule` → `defaultAiBillingPolicy.getImageRule()`
- 说明：
  - 对 usecase 与文档中提到的 `getAi*BillingRule` API 完全兼容。
  - 实际规则来源由“硬编码常量”切换到“websiteConfig + 策略”。

### 4. 调用方与文档同步

- Usecase 层：
  - `execute-ai-chat-with-billing.ts` / `analyze-web-content-with-credits.ts` / `generate-image-with-credits.ts` 保持依赖 `getAi*BillingRule` 不变。
  - 在架构说明中明确这些函数现在由 `AiBillingPolicy` 驱动。
- 文档更新：
  - `docs/ai-lifecycle.md`：
    - 在“AI 领域工具”中，将计费规则描述为：
      - 配置源：`websiteConfig.ai.billing.*`
      - 策略层：`src/ai/billing-policy.ts`
      - 适配器：`src/ai/billing-config.ts`
    - 在 Chat 与图片生成生命周期章节中，更新对 `getAi*BillingRule` 的说明，体现其经过策略层与配置源。
    - 在“扩展 AI 用例的建议”中，指引新增用例时先扩展 `websiteConfig.ai.billing` 与策略/适配器。

### 5. 测试与验证

- 新增 `tests/ai/billing-policy.test.ts`：
  - 验证当 `websiteConfig.ai.billing.chat` 设置为自定义值时，`DefaultAiBillingPolicy.getChatRule` 返回对应规则。
  - 验证当 `websiteConfig.ai` 缺失时，策略回退到默认规则（enabled=true, creditsPerCall=1, freeCallsPerPeriod=8）。
  - 使用与 `tests/utils/credits-config.ts` 相似的模式，在测试中临时覆盖 `websiteConfig.ai`，并在 `finally` 中恢复原值。
- 回归检查：
  - 在本地/CI 运行 `pnpm test` / `pnpm lint`（按需要），确保行为与类型检查正常。

## 未来扩展建议（非本次实现范围）

- 在 `AiBillingContext` 中引入 plan/region 维度：
  - 从用户订阅/plan 信息中解析出 `planId`，在 usecase 调用策略时传入上下文。
  - 在 `DefaultAiBillingPolicy` 中根据 plan/region/env 决定最终规则（例如分层覆盖：全局默认 → 环境级 → plan/region 专属）。
- 引入可注入策略：
  - 将 usecase 对 `defaultAiBillingPolicy` 的直接依赖抽象为可注入的 `AiBillingPolicy`，便于按 tenant 或 A/B 实验替换策略实现。
  - 在测试与未来 console 配置实现中直接替换策略实例，而无需修改 usecase。

