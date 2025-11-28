---
title: UI 主题与设计系统最佳实践
description: 基于 MkSaaS 与 Shadcn/Tailwind 的主题与设计系统规范
---

## 适用范围

- 全局样式与主题：`src/styles/globals.css`、`src/styles/mdx.css`
- 基础 UI 组件：`src/components/ui/*`
- 布局与主题切换：`src/components/layout/*`（如 `theme-selector.tsx`、`active-theme-provider.tsx`）
- 文档与博客主题说明：`content/docs/theme.mdx`、`content/docs/theme.zh.mdx`、`content/blog/theme*.mdx`

## 设计目标

- 将颜色、排版、阴影、圆角等视觉设计抽象为可复用设计 tokens。
- 确保 Dark/Light 模式与多主题切换行为稳定且可配置。
- 为产品 UI 与 Docs UI 提供一致的视觉语言与组件基础。

## 核心原则

1. **设计 Token 优先**
   - 所有颜色、间距、圆角、阴影等均通过 CSS 变量 + Tailwind @theme 定义。
   - 页面与组件只使用语义化 token（如 `bg-background`、`text-muted-foreground`），避免直接写 hex 值。

2. **主题切换与模式解耦**
   - 将“主题集合”（颜色方案）与“模式选择”（light/dark + theme）解耦：
     - 主题配置放在 CSS 与主题组件中；
     - 当前主题存储在 localStorage / cookie，由 `active-theme-provider` 与 `theme-selector` 管理。

3. **Shadcn / Radix / Fumadocs 协同**
   - Shadcn UI、Radix primitives 的 tokens 与 Fumadocs UI 的 `fd-*` tokens 通过 @theme & 映射统一。
   - 避免不同 UI 栈使用完全独立的颜色与 spacing 体系。

4. **响应式与可扩展**
   - 设计系统应支持常见断点（如 `sm/md/lg/xl`）下的布局变化，而不在每个页面中硬编码魔法数。

## 实践要点（结合本仓库）

1. 全局主题定义
   - `src/styles/globals.css`：
     - 使用 `@theme inline` 将 Shadcn dashboard 示例的 tokens 映射为项目的 `--color-*`、`--radius-*`、`--shadow-*` 等变量。
     - 明确注释了主题来源与修改注意事项。
   - `content/docs/theme*.mdx` 与 `content/blog/theme*.mdx`：
     - 说明 Fumadocs UI 主题的用法与与 Tailwind 的集成方式。

2. 主题切换
   - `src/components/layout/theme-selector.tsx`、`active-theme-provider.tsx`：
     - 封装主题选择 UX，基于 Shadcn dashboard 示例实现。
   - `src/components/layout/mode-switcher*.tsx`：
     - 提供 light/dark 模式切换控制。

3. 基础 UI 组件
   - `src/components/ui/*`：
     - 为常用交互（Button、Input、Dialog 等）提供统一外观与交互模式，对应 Tailwind 类和设计 tokens。

## 反模式（应避免）

- 在页面或组件中直接书写硬编码颜色/边距，而不使用设计 tokens。
- 为某个特定组件单独引入一套新的颜色/字体体系，破坏整体统一性。
- 在多个地方实现独立的主题切换逻辑，而不复用 `active-theme-provider` / `theme-selector`。

## Checklist

- [ ] 新组件只使用语义化设计 tokens，不直接写魔法数颜色或 spacing。
- [ ] Dark/Light 模式下 UI 无明显“闪烁”或样式不一致问题。
- [ ] Docs 与 App 的主题在主要颜色与排版上保持统一风格。
- [ ] 主题配置变更有对应文档说明（例如在 `content/docs/theme*.mdx` 中记录）。

## 实施进度 Checklist

- 已基本符合
  - [x] 全局 CSS 使用 @theme 与 CSS 变量定义了系统化色板、圆角与阴影，来源清晰（Shadcn dashboard 示例）。
  - [x] 布局层提供了 `theme-selector`、`mode-switcher` 等组件，统一管理主题与模式切换。
  - [x] `src/components/ui/*` 已按 Shadcn 风格实现了系统化基础组件。
- 尚待调整 / 确认
  - [ ] 是否为自定义业务组件（Dashboard、Marketing Blocks 等）完全采用了同一套设计 tokens，而非局部硬编码样式。
  - [ ] 主题更新流程（新增/修改主题）是否在文档中标准化，避免团队成员各自引入新的 CSS 变量命名。
  - [ ] 是否需要为 Docs 与 App 之间的主题差异（如背景/宽度）制定明确的设计边界说明。

