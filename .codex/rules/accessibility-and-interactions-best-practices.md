---
title: 无障碍与交互模式最佳实践
description: 基于 Radix/Shadcn 的可访问性与交互行为规范
---

## 适用范围

- 基础交互组件：`src/components/ui/*`（Dialog、Menu、Tabs、Tooltip 等）
- 布局与主题：`src/components/layout/*`、`src/styles/globals.css`
- 文档主题与 RTL 支持：`content/docs/theme*.mdx`、`content/blog/theme*.mdx`

## 设计目标

- 确保所有关键交互对键盘与屏幕阅读器友好。
- 提供一致的焦点管理、层级管理（modal、popover 等）与动画反馈。
- 支持 RTL、多语言与暗色模式等多样环境下的可用性。

## 核心原则

1. **尽量使用 Radix / Shadcn 基础组件**
   - 对话框、菜单、工具提示、Tabs、Popover 等交互优先使用已经封装好的 `src/components/ui/*` 组件。
   - 避免从零实现复杂交互，降低无障碍与可用性风险。

2. **键盘导航优先**
   - 所有可聚焦元素必须可通过 Tab 访问，并提供明显的 focus 样式。
   - 对弹窗、菜单等组件确保：
     - 打开时焦点移动到合适位置；
     - 关闭时焦点回到触发元素；
     - 支持 Esc 关闭。

3. **ARIA 与语义 HTML**
   - 尽量使用语义标签（如 `<button>`、`<nav>`、`<header>`、`<main>` 等）。
   - 在必要时通过 ARIA 属性补充（如对话框 ARIA label 和 id 关联）。

4. **多语言与 RTL 支持**
   - 在主题文档中已说明 RTL 支持，对需要支持 RTL 的场景，应确保布局与组件互相兼容。

## 实践要点（结合本仓库）

1. 交互组件
   - `src/components/ui/dialog.tsx`、`dropdown-menu.tsx`、`navigation-menu.tsx`、`tooltip.tsx` 等：
     - 基于 Shadcn + Radix 封装，默认提供了可访问性支持。

2. 主题与 RTL
   - `content/docs/theme*.mdx` 与 `content/blog/theme*.mdx`：
     - 说明了使用 `dir="rtl"` 时 RootProvider 的配置方式，并强调 Radix 对 RTL 的要求。

3. 焦点与动画
   - `globals.css` 中包含统一的 focus 与动效（如 `--animate-*`），可用于增强交互反馈。

## 反模式（应避免）

- 使用 `<div>` 冒充 `<button>`，未设置适当的 role 与键盘事件。
- 在弹窗/菜单组件中忽略 Esc 关闭或焦点管理，导致键盘用户无法正常退出。
- 为了特殊视觉效果手动覆盖 focus 样式，导致焦点不可见。

## Checklist

- [ ] 所有交互性组件均基于 `src/components/ui` 或遵循 Radix 无障碍规范实现。
- [ ] 关键操作可通过键盘完成（尤其是对话框、菜单、Tabs、表单）。
- [ ] 焦点样式清晰，不会被自定义样式覆盖掉。
- [ ] 如需支持 RTL，布局与组件在 RTL 模式下仍然可用且视觉合理。

## 实施进度 Checklist

- 已基本符合
  - [x] 大量交互组件已基于 Shadcn + Radix 封装在 `src/components/ui/*` 中，默认遵循可访问性规范。
  - [x] 主题文档中已经描述了 RTL 与主题切换的配置方法。
- 尚待调整 / 确认
  - [ ] 业务自定义组件是否全部遵循与基础组件一致的无障碍与交互规范（特别是自定义快捷键、可拖拽组件等）。
  - [ ] 是否需要在设计/开发规范中明确列出“可访问性检查清单”，在开发新 UI 时作为 Review 依据。

