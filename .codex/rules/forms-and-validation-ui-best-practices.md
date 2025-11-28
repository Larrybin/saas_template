---
title: 表单与校验 UI 最佳实践
description: 基于 React Hook Form + Zod 的表单交互与错误展示规范
---

## 适用范围

- 表单 UI：`src/components/ui/form.tsx`、`src/components/ui/input.tsx`、`src/components/ui/select.tsx` 等
- 业务表单组件：`src/components/auth/*`、`src/components/settings/*` 等
- 校验与 schema：`src/ai/*/lib/api-schema`、`src/lib/server/*` 等

## 设计目标

- 为所有表单提供一致的布局、交互与错误展示体验。
- 将 schema 校验（Zod）与表单状态管理（React Hook Form）组合为可复用模式。
- 清晰区分 field-level 错误、form-level 错误与 API-level 错误。

## 核心原则

1. **以 schema 为真相**
   - 使用 Zod 定义表单输入 schema，并在前后端复用（如 API 请求体校验）。
   - React Hook Form 中的类型推导与默认值来源于相同 schema。

2. **UI 组件与 React Hook Form 解耦**
   - `ui/form.tsx` 提供 `Form`, `FormField`, `FormItem`, `FormLabel`, `FormMessage` 等组件。
   - 表单字段组件（Input/Select 等）通过 `control` 与 `name` 接入 React Hook Form，不在内部使用 `useForm`。

3. **错误展示统一**
   - Field-level 错误：
     - 使用 `FormMessage` 在 field 下方显示，统一样式。
   - Form-level 错误：
     - 在表单顶部或提交按钮附近显示通用错误（如 API 调用失败）。
   - API-level 错误：
     - 通过 DomainError / ErrorCodes 映射为 i18n 文案，并在 UI 层展示。

4. **交互体验**
   - 提交中状态（loading/disabled）与成功反馈（toast 或按钮状态）保持一致。
   - 尽量减少“静默失败”，每次提交都给用户明确反馈。

## 实践要点（结合本仓库）

1. 表单基础设施
   - `src/components/ui/form.tsx`：
     - 封装 React Hook Form 与 Shadcn UI 元素解绑逻辑，提供统一表单布局。
   - `input.tsx`、`select.tsx`、`textarea.tsx` 等：
     - 提供一致的基础输入样式。

2. 典型业务表单
   - Auth 表单（登录/注册/重置密码）与 Settings 表单（Profile、Security 等）：
     - 按推荐模式使用 `Form` + RHF + Zod 组合。

3. 校验与 API schema
   - AI 相关 API 的请求体 schema（如 `chatRequestSchema`、`generateImageRequestSchema`）：
     - 可作为 UI 表单校验的参考实现，保持前后端校验逻辑一致。

## 反模式（应避免）

- 在 UI 中重复实现与 Zod schema 不一致的“前端校验逻辑”。
- 使用未与 `Form` 组件集成的原生 `<form>` 与 `<input>`，导致错误样式与交互分裂。
- 表单失败时只在控制台打印错误，不对用户展示任何反馈。

## Checklist

- [ ] 新表单默认使用 `Form` + React Hook Form + Zod schema。
- [ ] 每个字段都有明确的错误展示位置与样式。
- [ ] 提交时按钮有 loading/disabled 状态，避免重复提交。
- [ ] API 失败错误通过统一的错误处理路径映射到 UI，而不是直接显示 raw error。

## 实施进度 Checklist

- 已基本符合
  - [x] `ui/form.tsx` 已为表单提供统一包装组件，简化了 React Hook Form 与 UI 集成。
  - [x] 部分核心表单（尤其是 Auth 与 Settings）已采用该模式实现一致的错误样式与布局。
  - [x] AI API 的 schema 校验为前后端对齐提供了良好基础。
- 尚待调整 / 确认
  - [ ] 是否所有新表单均已采用 `Form` + RHF + Zod 模式，而不是临时各写各的。
  - [ ] API-level 错误（如 Credits 不足、订阅过期）是否统一通过错误码 → i18n → UI 的路径展示给用户。
  - [ ] 是否需要在 docs 或 `.codex/rules` 中再补充一份更详细的“表单模式 cookbook”（常见场景示例）。

