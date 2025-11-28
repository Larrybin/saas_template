---
title: 布局与导航 UI 最佳实践
description: 基于 MkSaaS 模板的布局、导航与响应式设计规范
---

## 适用范围

- 布局组件：`src/components/layout/*`
- 页面布局：`src/app/[locale]/(marketing)/*`、`src/app/[locale]/(protected)/*`
- 全局样式：`src/styles/globals.css`

## 设计目标

- 为营销页、Docs、Dashboard 等不同区域提供清晰、一致的布局框架。
- 保证在桌面与移动端下导航体验一致且可用。
- 将布局相关逻辑集中在少数布局组件中，减少重复与不一致。

## 核心原则

1. **区域化布局**
   - 将应用划分为 Marketing、Docs、Dashboard 等区域，各自使用对应 layout 组件。
   - 布局组件负责 header/footer/sidebar 导航、语言/主题切换等“横切” UI 能力。

2. **响应式优先**
   - 导航组件（Navbar、Sidebar）必须在 `md`/`lg` 等断点上有明确行为（折叠、抽屉、变为 icon-only 等）。
   - 使用 Tailwind 响应式 class（如 `hidden md:flex`）而非在组件中写大量 JS 媒体查询逻辑。

3. **导航一致性**
   - 所有主要入口（Dashboard、Pricing、Docs 等）在导航中有统一位置。
   - 用户状态（登录/未登录）下的导航差异由布局层统一处理。

4. **关注内容可读性**
   - 内容区域宽度、行高、间距等通过全局 CSS 与 layout 组件控制，避免每个页面单独调整。

## 实践要点（结合本仓库）

1. 布局组件
   - `src/components/layout/navbar.tsx`、`navbar-mobile.tsx`、`sidebar.tsx`：
     - 提供跨页面的主导航结构与响应式行为。
   - `container.tsx`：
     - 封装页面内容 max-width 与左右 padding，保持内容区域一致。
   - `header-section.tsx`、`footer.tsx`：
     - 统一营销页头部/底部结构。

2. 模式与语言切换
   - `mode-switcher*.tsx`、`theme-selector.tsx`、`locale-switcher.tsx`：
     - 统一在布局中提供全局模式与语言切换控件。

3. 全局样式
   - `src/styles/globals.css`：
     - 定义基础 typography、背景、布局宽度等，为 Docs 与 App 提供一致的基础样式。

## 反模式（应避免）

- 在单个页面中创建与全局导航完全不同的 header/footer，造成体验割裂。
- 将布局逻辑分散在多个不相关组件中，难以统一改动。
- 依赖 JS 动态测量来实现本可用 CSS 完成的简单响应式布局。

## Checklist

- [ ] 营销、Docs、Dashboard 等区域均有对应的布局组件，页面只关注内容本身。
- [ ] 导航在桌面与移动端都有良好体验（包括可触达性与可见性）。
- [ ] 模式/语言切换逻辑只存在于布局层，而不在页面/组件中重复实现。
- [ ] 全局内容宽度与排版在各主要页面上看起来一致。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/components/layout/*` 中已有完整的导航、主题切换、语言切换与用户菜单组件。
  - [x] `container.tsx` 与全局 CSS 为内容区域提供了一致的宽度与边距控制。
- 尚待调整 / 确认
  - [ ] 各区域对应的 Next.js layout 是否完全复用这些布局组件，避免在某些页面中出现“绕过布局”的特例实现。
  - [ ] 是否需要在 docs 或设计规范中补充常见布局 pattern 的推荐用法（如“两栏布局”、“Dashboard 主/副边栏”等）。

