---
title: 国际化（i18n）最佳实践
description: 基于 MkSaaS 模板、Next.js App Router 与 Fumadocs 的应用与文档国际化规范
---

## 适用范围

- 应用路由：`src/app/[locale]/*`
- 文案资源：`messages/en.json`、`messages/zh.json`
- 文档系统：`content/docs/*`、`src/types/content.ts`、Fumadocs 相关配置

## 设计目标

- 应用与文档使用统一的 locale 模型与命名约定。
- 文案集中管理，避免在组件中散落硬编码字符串。
- 支持逐步增加语言，而不破坏现有结构。

## 核心原则

1. **单一 locale 参数**
   - 使用 Next.js App Router 推荐模式：
     - 所有页面 nested 在 `app/[locale]` 下，`[locale]` 为当前语言标识。
     - 布局与页面通过 `params.locale` 获取当前语言。
   - 保持 `messages/*` 与路由中的 locale 一致（如 `en`、`zh`）。

2. **业务文案与系统文案分层**
   - `Common`、`Metadata` 等系统文案：
     - 用于导航、按钮、通用提示等。
   - 业务模块文案：
     - 以页面或 Feature 为前缀，例如 `PricingPage.*`、`AITextPage.*`。
   - 错误文案：
     - 与错误码映射配置（如 `DOMAIN_ERROR_MESSAGES`）相对应。

3. **文档与应用共享信息结构**
   - 对于价格、功能、限制等信息：
     - 应尽量通过配置或结构化数据统一维护，再由应用与文档分别渲染。
   - Fumadocs 文档中引用配置时，优先通过导入已有 TypeScript 类型（如 `PageData`、`MarkdownEntryFields`）。

4. **避免在组件中硬编码多语言逻辑**
   - 组件不直接判断 locale（如 `if (locale === 'zh')`），而是通过文案系统提供不同内容。
   - 仅在确有必要时（如中英排版差异较大）在更高层做分支。

5. **时区、货币与格式化的统一**
   - 日期与时间格式：
     - 使用统一的 date-fns/Intl 工具封装（参考 `date-fns-best-practices` 规则）。
   - 货币：
     - 价格显示与 Stripe 计费应使用相同 currency 配置与格式化函数。

## 实践要点（结合本仓库）

1. 路由与布局
   - 确保所有营销页、Docs、Dashboard 等均在 `src/app/[locale]` 下有对应布局。
   - 在顶层布局中设置 `<html lang={locale}>`，并将 locale 传递给 UI Provider（如 Fumadocs 的 `RootProvider`）。

2. 文案组织
   - `messages/en.json` 与 `messages/zh.json`：
     - 保持 key 结构完全对齐。
     - 新增模块时，统一以模块名作为顶层 key。
   - 错误文案：
     - 与 `DOMAIN_ERROR_MESSAGES` 中的 i18n key 保持一一对应。

3. 文档国际化
   - Fumadocs 文档（如 `content/docs/internationalization.mdx`）：
     - 用于说明“如何在本项目增加新语言与新文案”。
     - 推荐在文档中给出：新增 locale、扩展 messages 文件、修改路由与布局的步骤。

4. 搜索与 SEO
   - 对文档搜索（Orama 或其它方案）：
     - 为不同语言维护独立索引或在文档元数据中携带 `locale` 字段。
   - 为页面设置正确的 `lang` 与多语言链接（如 `hreflang`），避免搜索引擎混淆。

## 反模式（应避免）

- 在组件中直接写中文/英文，而不通过 messages。
- 不同语言的 messages 文件 key 结构不一致，导致运行时缺 key。
- 使用不一致的 locale 标识（如路由用 `cn`，messages 用 `zh`）。

## Checklist

- [ ] 所有应用页面与文档都能通过统一的 `locale` 参数区分语言。
- [ ] `en.json` 与 `zh.json` 的 key 结构一致，新 key 有双语翻译。
- [ ] 新增语言时，不需要重构现有组件，只需补充配置与资源。

## 实施进度 Checklist

- 已基本符合
  - [x] 应用路由已采用 `src/app/[locale]` 结构，并通过 `next-intl` 的 `routing.ts` 定义 `locales` / `defaultLocale` / `LOCALE_COOKIE_NAME`。
  - [x] `messages/en.json` 与 `messages/zh.json` 已为核心页面（如 Pricing、Credits、Common 等）提供了对齐的 key 结构与文案。
  - [x] 认证与邮件相关逻辑（如 `src/lib/auth.ts` 中的 `getLocaleFromRequest`）已经在服务端根据 locale 选择正确的文案与模板。
- 尚待调整 / 确认
  - [ ] `content/docs/internationalization.mdx` 仍以 Fumadocs 泛用示例为主，尚未完整说明本项目的实际 i18n 路由与 messages 约定，需要按本规则重写或补充一节“Project-specific usage”。
  - [ ] 所有 `[locale]` 下的布局组件是否都已设置 `<html lang={locale}>`，并将 locale 透传到 UI Provider（包含 Dashboard、Docs、Marketing 等不同 layout）。
  - [ ] `DOMAIN_ERROR_MESSAGES` 中使用的 i18n key 是否在 `messages/*` 中全部存在，对应的静态校验脚本（如 `scripts/check-domain-error-messages.ts`）是否已实现并纳入 CI。
