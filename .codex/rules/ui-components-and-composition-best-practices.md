---
title: UI 组件与组合模式最佳实践
description: 基于 MkSaaS 的基础 UI 组件与特性组件组合规范
---

## 适用范围

- 基础组件：`src/components/ui/*`
- 布局与导航组件：`src/components/layout/*`
- Feature 级组件：`src/components/dashboard/*`、`src/components/blocks/*`、`src/components/settings/*` 等

## 设计目标

- 用一套统一的基础组件（buttons、inputs、dialogs 等）支撑所有页面。
- 将复杂的 UI 行为封装为可重用 Feature 组件，避免在页面中堆积“散装 JSX”。
- 保持组件职责单一、组合明确，方便测试与演进。

## 核心原则

1. **基础组件作为“设计原子”**
   - 所有按钮、输入框、弹窗等基础交互均来自 `src/components/ui/*`。
   - 新的基础 UI 模式（如新的表单控件）优先在 `ui` 目录中抽象，而不是直接在 Feature 组件内部实现。

2. **Feature 组件组合基础组件**
   - Feature 级组件（如 PricingCard、Dashboard 卡片）应只组合基础组件与少量布局样式。
   - 避免在 Feature 组件中直接与 DOM 原生元素长期绑定，以免破坏一致性。

3. **清晰的 props 设计**
   - 基础组件：props 越少越好，聚焦通用场景（variant/size/disabled 等）。
   - Feature 组件：使用显式 props 定义业务语义（如 `plan`, `credits`, `onUpgrade`），不要将整个 `user` 对象直接透传。

4. **避免级联的嵌套状态**
   - 组件内状态只负责自身 UI 交互（如是否展开、当前 Tab）。
   - 业务状态（当前计划、Credits 余额）应从上层容器传入或来自专门 Hooks，而不在组件内部自行请求。

## 实践要点（结合本仓库）

1. Shadcn 风格基础组件
   - `src/components/ui/button.tsx`、`input.tsx`、`dialog.tsx` 等：
     - 统一使用 Tailwind 类与 Variant 模式（如 `variant="outline"` 等）。
   - `form.tsx`：
     - 封装了 React Hook Form 与 UI 元素的集成，为表单提供统一外观与错误显示模式。

2. 布局组件
   - `src/components/layout/*`：
     - Header / Navbar / Sidebar / Footer / UserButton / CreditsBalance 等组件负责布局与导航结构。
   - 推荐将“导航 + 状态展示”封装在布局组件中，页面组件只传入数据/回调。

3. Feature 组件
   - `src/components/dashboard/*`、`src/components/settings/*`、`src/components/blocks/*` 等：
     - 按领域划分，组合基础组件呈现完整业务 UI。

## 反模式（应避免）

- 在 Feature 组件中直接使用 `<button>`、`<input>`，而绕过 `ui/button` / `ui/input`。
- 组件内部直接发起复杂数据请求并管理全局状态，导致难以复用或测试。
- props 设计为“万能对象”（如 `props: any` 或直接传整个 user/session），破坏清晰边界。

## Checklist

- [ ] 新 UI 需求先尝试复用或扩展 `src/components/ui` 中的基础组件。
- [ ] Feature 组件主要通过组合基础组件与布局组件实现，而不是直接组装原生 DOM。
- [ ] 组件 props 设计清晰、职责单一，无超大“万能 props”对象。
- [ ] 复杂业务状态通过专用 hooks 或上层容器控制，而不是散落在多个组件内部。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/components/ui/*` 已提供一套覆盖面较广的基础 UI 组件，风格与交互一致。
  - [x] `src/components/layout/*` 将导航与主题/locale 切换封装为组件，减少页面内部重复布局代码。
  - [x] Dashboard / Settings / Blocks 等目录已按领域拆分 Feature 组件。
- 尚待调整 / 确认
  - [ ] 新功能开发时是否统一遵循“先看 ui/*、再做组合”的路径，而不是临时写一套新的基础样式。
  - [ ] 是否存在未复用的“局部按钮/输入”，可以回收为基础组件或统一替换为 `ui/*`。
  - [ ] Feature 组件的 props 是否需要进一步瘦身，使其更易于复用与测试。

