---
title: Analytics 埋点与事件追踪最佳实践
description: 基于 MkSaaS 模板的多 Provider Analytics 集成与事件设计规范
---

## 适用范围

- Analytics 集成组件：`src/analytics/*`
- 相关 env：`env.example` 中的 `NEXT_PUBLIC_*_ANALYTICS_*` 变量
- 文档：`docs/env-and-ops.md`、`docs/feature-modules.md`

## 设计目标

- 为页面访问与关键业务事件提供统一的埋点与统计方案。
- 支持多种 Analytics Provider（GA、Plausible、Umami、OpenPanel 等）可插拔。
- 保证对隐私与合规要求的基本尊重（不记录敏感数据）。

## 核心原则

1. **页面级与事件级分离**
   - 页面级：PV / 页面停留时间等，主要由 `src/analytics/*-analytics.tsx` 组件负责。
   - 事件级：如“注册成功”、“完成首次付款”、“使用 AI 功能”等，优先通过统一事件 API 上报。

2. **Provider 抽象**
   - 每个 Provider 独立一个组件文件（如 `google-analytics.tsx`、`plausible-analytics.tsx`）。
   - 由 `src/analytics/analytics.tsx` 或顶层 Layout 统一决定使用哪个 Provider。
   - 通过 env 变量控制启用 / 禁用，而不是硬编码。

3. **事件命名规范**
   - 事件名使用 kebab-case 或 snake_case，保持稳定：
     - 例如：`auth_sign_up_completed`、`billing_checkout_started`、`ai_chat_message_sent`。
   - 属性字段尽量结构化，避免将多维信息塞进一个字符串中。

4. **隐私与合规**
   - 埋点中不记录敏感字段（如 email、手机号、完整 URL token）。
   - 如需记录 userId，优先使用内部匿名 ID 或 hash 后 ID。

## 实践要点（结合本仓库）

1. Analytics 组件
   - `src/analytics/*-analytics.tsx` 为不同 Provider 提供了独立组件。
   - `env.example` 中包含多个 `NEXT_PUBLIC_*` Analytics ID，用于按需启用不同 Provider。

2. 集成方式
   - 建议在顶层 Layout 中根据 env 与配置统一挂载 Analytics 组件，而不是在页面内散落调用。
   - 若后续引入事件级埋点 API，可在 `src/analytics` 下增加统一的 `trackEvent` 封装。

3. 文档与配置
   - `docs/env-and-ops.md` 中可以对各 Provider 的推荐使用场景与配置方式进行说明。

## 反模式（应避免）

- 在多个页面中分别手动插入 Analytics script，而不经过统一组件。
- 为了“看起来更详细”在事件属性中记录敏感信息。
- 使用不稳定的事件名（频繁改动或过度依赖文案），导致报表难以对齐。

## Checklist

- [ ] Analytics Provider 均通过集中组件 / 配置启用，而非散落在各页面内。
- [ ] 关键业务事件有统一的事件命名方案与上报入口。
- [ ] 埋点数据不包含敏感信息，或在进入第三方系统前做脱敏。
- [ ] env 中 Analytics 相关变量与文档说明保持同步。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/analytics/*` 为不同 Provider 提供了组件级抽象，便于在 Layout 中统一挂载。
  - [x] `env.example` 中列出了各 Provider 对应的 `NEXT_PUBLIC_*` 环境变量，明确了配置入口。
- 尚待调整 / 确认
  - [ ] 是否已经定义了统一的事件级埋点 API（例如 `trackEvent`），而不是在组件中直接调用各 Provider 的全局对象。
  - [ ] 关键业务路径（注册、订阅、AI 使用）是否已有清晰的事件命名与上报规范。
  - [ ] 文档是否明确说明 Analytics 数据的隐私策略与最小化原则。

