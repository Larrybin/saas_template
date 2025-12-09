---
title: Accessibility & Interaction Audit
description: 静态审查交互组件的可访问性与交互一致性
date: 2025-12-09
---

## 范围与方法
- 覆盖目录：`src/components/ui`, `src/components/layout`, `src/components/shared`, `src/components/magicui`, `src/components/ai-elements`, `src/components/blog`, `src/components/newsletter`, `src/components/contact`, `src/components/settings/**/*`, `src/app/**/*` 中的交互式使用片段、`content/**/*` 中的交互示例。
- 参照 `.codex/rules/accessibility-and-interactions-best-practices.md` 及 Radix/Shadcn 组件库默认可访问性行为，仅进行静态代码审查（无实际运行 / 无屏幕阅读器验证）。
- 聚焦键盘可达性、焦点管理、语义/ARIA、一致的状态反馈、RTL/主题兼容性以及是否复用 `src/components/ui/*`。

## 总体评估
- ✅ 大部分基础交互直接复用 Shadcn/Radix 封装（Dialog、DropdownMenu、Select、Tabs 等），语义和焦点管理由库保证。
- ⚠️ 若干自定义交互（移动端导航、Hero 视频弹窗、博客分页、动态表单反馈）绕开了 Radix 封装，以 `div` 或 `<a>` 的方式实现，导致键盘或屏幕阅读器体验缺失。
- ⚠️ 魔术组件 (`magicui/*`) 中的自定义动画按钮存在语义重复、缺少可访问标签等问题，需要补充 `aria-*` 与显式角色。

## 详细问题清单

### 1. 移动端抽屉菜单缺少对话框语义与焦点管理（高）
- **位置**：`src/components/layout/navbar-mobile.tsx:104-210`
- **问题**：移动端菜单使用 `<Portal>` + `<div className="fixed w-full inset-0 ...">` (`MainMobileMenu` 组件起始于第 154 行) 模拟模态层，仅依赖 `RemoveScroll`，没有 `role="dialog"`、`aria-modal`、焦点陷阱或 `Esc` 关闭逻辑。打开菜单后，Tab 焦点仍可落在背景内容，且无法通过键盘快速退出。
- **影响**：违反“键盘导航优先”与“焦点管理”要求，屏幕阅读器用户难以分辨当前状态，键盘用户可能无法退出遮罩。
- **建议**：改用 `Dialog`/`Sheet`（`src/components/ui/dialog|sheet`）或在现有容器上增加：
  - `role="dialog"`、`aria-modal="true"`，为侧边栏内容提供 `aria-labelledby`。
  - 聚焦菜单内第一个可聚焦元素并在关闭时恢复至触发按钮（利用 `FocusScope` 或 Radix `Dialog`）。
  - 监听 `Escape` 键关闭（`useEffect` 绑定 `keydown`）并在 `RemoveScroll` 外包裹 `FocusTrap`。

### 2. HeroVideoDialog 的触发/关闭不可键盘操作，iframe 无标题（高）
- **位置**：`src/components/magicui/hero-video-dialog.tsx:83-132`
- **问题**：
  - 第 83-85 行以 `<div className="... cursor-pointer" onClick={...}>` 触发弹窗，缺少 `<button>` 语义和 `onKeyDown`，键盘无法打开视频。
  - 第 114 行的遮罩 `<motion.div>` 及第 123 行 `motion.button` 没有 `role="dialog"`、`aria-modal` 或 `aria-label`，也没有焦点管理。
  - 第 127 行嵌入的 `<iframe>` 未设置 `title`。
- **影响**：键盘与辅助技术无法可靠打开/关闭视频弹窗，屏幕阅读器看不到关闭按钮用途，也无法识别 iframe 内容。
- **建议**：将整个交互重构为 `Dialog`（`DialogTrigger` + `DialogContent`），确保：
  - 使用真正的 `<button>` 触发并提供 `aria-label`。
  - 关闭按钮提供 `aria-label="关闭视频"` 并可通过 `Esc` 关闭。
  - 在 `DialogContent` 上声明 `role="dialog"`、`aria-modal="true"` 并聚焦内部。
  - 为 `<iframe>` 添加描述性 `title`。

### 3. 博客分页链接缺少 `href`，Tab 无法聚焦（高）
- **位置**：`src/components/shared/pagination.tsx:52-78`, `src/components/ui/pagination.tsx:31-66`
- **问题**：`PaginationLink` 渲染 `<a>`，而 `CustomPagination` 在第 52-78 行仅传入 `onClick`，未提供 `href` 或 `role="button"`。没有 `href` 的 `<a>` 默认不可聚焦/不可被屏幕阅读器识别为可点击项。
- **影响**：键盘用户无法通过 Tab 定位分页按钮，违背“关键操作可通过键盘完成”原则；也破坏了 `<nav aria-label="pagination">` 的语义。
- **建议**：
  - 为每个分页项提供 `href`（例如 `href={`${routePrefix}/page/${page}`}`），并保留 `onClick` 以调用 `router.push`。
  - 或将 `PaginationLink`/`PaginationPrevious`/`PaginationNext` `asChild` 包裹 `<button>`，并添加 `type="button"` 与 `aria-controls`。

### 4. 表单错误/成功提示未使用 `role="alert"` 或 `aria-live`（中）
- **位置**：`src/components/shared/form-error.tsx:10-13`, `src/components/shared/form-success.tsx:10-13`
- **问题**：组件返回普通 `div`，未声明 `role="alert"` 或 `aria-live`。当校验失败或成功消息出现时，屏幕阅读器不会主动播报。
- **影响**：违反“确保关键反馈对屏幕阅读器友好”的要求，视觉受损用户无法及时知晓表单状态。
- **建议**：在外层 `div` 添加 `role="alert" aria-live="assertive"`（错误）或 `aria-live="polite"`（成功），并可包含 `aria-atomic="true"` 以确保整段文本被一次播报。

### 5. InteractiveHoverButton 重复文本，缺少隐藏声明（中）
- **位置**：`src/components/magicui/interactive-hover-button.tsx:23-30`
- **问题**：按钮内部有两个包含同样 children 的 `<span>`，第二段通过 CSS 平移实现动画，但未加 `aria-hidden`。屏幕阅读器会读出两遍相同文案。
- **影响**：附加文本噪音，破坏“语义清晰”原则，使得 button label 冗余。
- **建议**：为视觉用的动画层添加 `aria-hidden="true"`，并确保真正的 label 仅保留一次；若辅助图标只在动画时可见，可通过 `aria-hidden` 隐藏并在按钮上提供 `aria-label`。

## 后续建议
- 对所有魔术/营销组件（`magicui/*`, `ai-elements/*`）建立“可访问性封装”清单，明确哪些需要 `aria-hidden`、`sr-only` 或 `role`。
- 在 PR 模板中加入 `.codex/rules/accessibility-and-interactions-best-practices.md` 的核对项，确保新增交互遵循键盘/焦点/ARIA 规范。
- 建议为移动端导航与营销弹窗添加 Vitest/Playwright 快照或 Storybook 交互说明，以防回归再度破坏焦点管理。
