---
title: 文档／内容系统（Docs／Blog／Changelog）最佳实践
description: 基于 Fumadocs 与 MkSaaS 的文档与内容组织规范
---

## 适用范围

- 文档内容：`content/docs/*`
- 博客与 changelog：`content/blog/*`、`content/changelog/*`、`content/author/*`、`content/category/*`
- 内容类型定义：`src/types/content.ts`
- 文档/Blog 功能：`src/lib/docs/*`、`src/lib/blog/utils.ts`

## 设计目标

- 为产品文档、博客与变更日志提供结构化、可扩展的内容体系。
- 支持多语言内容（en/zh）的一致组织与渲染。
- 保持 docs/blog/changelog 与实际功能 / 发布节奏同步演进。

## 核心原则

1. **内容类型明确**
   - Docs：产品功能、指南、API 等长期文档 → `content/docs/*`。
   - Blog：新闻、文章、教程等时间序列内容 → `content/blog/*`。
   - Changelog：版本更新说明 → `content/changelog/*`。
   - meta 信息（title/description/date/categories/author 等）通过 frontmatter + `src/types/content.ts` 类型约束。

2. **多语言对齐**
   - 文档与博客基本成对存在 `*.mdx` 与 `*.zh.mdx`。
   - meta 文件（如 `meta.json` / `meta.zh.json`）用于描述文档结构与排序。

3. **内容作为“代码的一部分”管理**
   - 文档/博客与功能变更尽量同 PR 提交。
   - 重要架构/领域文档（如 Credits / Payment lifecycle）与实现保持同步。

4. **可导航与可发现**
   - 使用 Fumadocs 的 i18n + search 能力，使内容易于导航与检索。

## 实践要点（结合本仓库）

1. 内容结构
   - `content/docs/*`：
     - 包含 index、使用指南、国际化、搜索、主题等文档（英文与中文版本）。
   - `content/blog/*` 与 `content/changelog/*`：
     - 对应产品主题的博客文章与版本更新说明，同样有 en/zh 对应文件。
   - `src/types/content.ts`：
     - 定义 Blog/Changelog/Marketing page frontmatter 类型。

2. i18n 与 UI 集成
   - `src/lib/docs/i18n.ts`、`src/lib/docs/ui-i18n.ts`：
     - 用于 docs 部分的国际化。
   - Docs 主题与布局文档（`content/docs/theme*.mdx`）：
     - 说明了 Fumadocs 与 Tailwind 主题集成方式。

3. 领域文档
   - `docs/credits-lifecycle.md`、`docs/payment-lifecycle.md`、`docs/architecture-overview.md` 等：
     - 对核心领域与模块提供更工程化的说明，可与 Fumadocs docs 交叉链接。

## 反模式（应避免）

- 功能上线后长期不更新文档/博客/changelog，导致内容过时。
- 在文档里直接硬编码与代码实现不一致的配置/约定。
- 文档结构混乱，不区分面向用户的 docs 与面向开发者/运维的内部 docs。

## Checklist

- [ ] 新增或变更核心功能时，同步更新相关 docs/blog/changelog 与内部架构文档。
- [ ] 多语言内容保持结构对齐，避免一边有 docs 一边缺失。
- [ ] 内容 frontmatter 与 `src/types/content.ts` 的类型约束一致。
- [ ] Docs 搜索与导航结构清晰，常用主题易于发现。

## 实施进度 Checklist

- 已基本符合
  - [x] `content/docs`、`content/blog`、`content/changelog` 已按类型和语言清晰组织。
  - [x] `src/types/content.ts` 对内容 frontmatter 提供了强类型支持。
  - [x] 关键领域文档（Credits、Payment、Architecture、Testing 等）已经在 `docs/*` 中存在。
- 尚待调整 / 确认
  - [ ] 是否需要在 Docs 中增加一页“Developer Guide / Internal Docs 索引”，统一链接 `docs/*` 与 `.codex/rules/*` 等内部规范文档。
  - [ ] 功能频繁迭代的区域（如 AI 功能、Billing 方案）是否有机制定期审视对应文档的时效性。
  - [ ] 对外文档的版本管理策略（某些 Breaking 变更）是否需要进一步规范。

