---
title: 多租户与租户隔离最佳实践
description: 规划在 MkSaaS 上实现多租户（workspace / project / team）能力时的设计规范
---

## 适用范围

- 未来多租户扩展相关模块：`src/domain/*`、`src/credits/*`、`src/payment/*`、`src/app/[locale]/(protected)/*`、`src/components/dashboard/*`、`src/components/admin/*`
- 现有用户/订阅/积分架构：`src/lib/auth-types.ts`、`src/domain/billing/*`、`src/credits/*`

> 说明：当前仓库实现的是“单租户 + 单用户空间”模型，本规则用于约束未来在此基础上扩展 workspace / team / project 等多租户能力的设计方向。

## 设计目标

- 支持“每个账号可管理多个工作区/组织”的多租户模型（workspace / project / team 等）。
- 确保数据访问与资源消耗按租户隔离，防止越权与数据串租。
- 与 Billing、Credits、AI 使用等能力自然衔接（可按租户计费与限额）。

## 核心原则

1. **显式租户模型**
   - 引入明确的租户概念（如 `Workspace` / `Organization`）：
     - 独立 ID（`workspaceId`）；
     - 名称、slug、自定义域等元数据；
     - 与用户之间的多对多关系（用户可属于多个 workspace）。

2. **全链路携带租户上下文**
   - 从路由 / UI → API → Usecase → Domain / DB：
     - 始终携带 `workspaceId`（或等价租户标识）。
   - 禁止在深层模块中通过“当前用户”推断租户，而不显式传入。

3. **数据与权限按租户隔离**
   - 所有与业务数据相关的表（Documents、Jobs、Usage、Credits、Billing 等）都应有 `workspaceId` 或等效关联。
   - 查询默认按租户过滤：
     - 默认为“当前 workspace 的数据”，不显式跨租户。

4. **计费与限额按租户维度建模**
   - 订阅计划与 Credits 可绑定在 workspace 上：
     - `workspace` 订阅 plan，plan 决定该 workspace 下用户数、资源限额与 AI 用量。
   - 用户个人 Credits 与租户 Credits 的关系需在领域上明确：
     - 优先按租户计费，个人层面仅保留补充场景。

## 未来实践要点（结合本仓库现状）

1. 模型演进
   - 现有 Billing / Credits / AI 模型以 `userId` 为核心：
     - 引入 workspace 后，可将关键实体扩展为包含 `workspaceId`：
       - Credits：`userId` + `workspaceId`（如按 workspace 记账）；
       - Usage：AI 使用记录与限额绑定 `workspaceId`；
       - Payment：订阅与发票与 workspace 关联。

2. 路由与 UI
   - 在 `[locale]/(protected)` 路由下引入 workspace 选择与切换 UI：
     - 如 `/[locale]/app/[workspaceSlug]/...`；
     - Dashboard / Admin 视图显示当前 workspace 维度的数据。

3. Admin 与运维工具
   - `src/components/admin/*` 可扩展为按 workspace 视角管理用户 / 订阅 / 使用情况。
   - 必须防止 Admin 工具绕过租户隔离，所有查询都需要显式指定 workspace。

## 反模式（应避免）

- 在部分表上添加 `workspaceId` 字段，但未在查询/权限/计费逻辑中贯穿使用，导致“伪多租户”。
- 通过“用户角色”隐式区分租户，而不建模 workspace 实体。
- 在 UI 中允许用户通过修改 URL 参数访问其他租户数据，没有二次鉴权。

## Checklist

- [ ] 在引入多租户前，完成对现有领域模型（Billing、Credits、AI 等）的“租户化”影响评估。
~- [ ] 工作区 / 组织模型在领域层与 DB 层均有明确建模，并有迁移方案。~（规划阶段）
~- [ ] 全链路 API / Usecase / Domain 方法签名中引入 `workspaceId` 参数。~（规划阶段）
~- [ ] Admin / 运维工具按租户维度提供视图，并有越权防护。~（规划阶段）

## 实施进度 Checklist

- 当前状态
  - [x] 现有实现为单租户模型，Billing / Credits / AI 等领域围绕 `userId` 设计，简化了初始复杂度。
  - [x] 架构上区分了领域层（Billing / Credits / AI）与 Usecase / API，可为未来引入 `workspaceId` 留出扩展点。
- 尚待规划 / 实施
  - [ ] 明确未来 workspace / organization 的领域模型与数据迁移路径，在 `.codex/rules` 或 `docs/architecture-overview.md` 中补充设计草案。
  - [ ] 对 Billing / Credits / AI 使用等领域梳理“按用户计费”与“按租户计费”的边界，避免引入 workspace 时逻辑重复。
  - [ ] Admin 工具与 Dashboard 在引入多租户后统一工作区上下文，并在 URL / Session / UI 中保持一致。

