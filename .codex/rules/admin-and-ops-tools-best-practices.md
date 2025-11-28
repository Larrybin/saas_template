---
title: 管理后台与运维工具最佳实践
description: 基于 MkSaaS 模板的 Admin 后台与运维工具设计规范
---

## 适用范围

- 管理后台 UI：`src/components/admin/*`、`src/components/dashboard/*`
- 运维脚本与工具：`scripts/*`、`tests/*`（运维相关测试）
- 领域服务：`src/domain/*`、`src/credits/*`、`src/payment/*`（Admin 功能的后端依赖）

## 设计目标

- 为产品所有者提供统一的管理后台视图（用户、订阅、Credits、AI 使用等）。
- 确保 Admin 操作安全、可审计，并与领域服务保持清晰边界。
- 运维工具（脚本/Job）与 Admin UI 相辅相成，支持常见维护任务。

## 核心原则

1. **读多写少，写操作需额外保护**
   - Admin 界面默认以只读视图为主（用户/订阅/使用情况）。
   - 涉及写操作（ban/unban、手动调整 Credits、手动修正订阅状态）需要二次确认或更严格权限。

2. **复用领域服务**
   - Admin 不直接操作数据库，而是通过现有领域服务（Billing、Credits、Payment 等）暴露的 API 完成操作。
   - 这样可避免 Admin 行为与业务行为分裂。

3. **可审计与观测**
   - 重要 Admin 操作需记录日志（含 adminId、目标实体、操作内容与结果）。
   - 对高风险操作可考虑额外记录审计日志表或告警。

4. **运维工具与 Admin UI 协同**
   - 运维脚本适合处理“批量/一次性”任务（如 backfill、修复）。
   - Admin UI 适合处理“单用户/小批量”任务（如查看/调整个别用户状态）。

## 实践要点（结合本仓库）

1. 管理后台 UI
   - `src/components/admin/users-page.tsx` + `users-table.tsx` + `user-detail-viewer.tsx`：
     - 提供用户列表、搜索、分页、排序与详情视图。
     - 使用 `useUsers` hook 获取数据，通过 TanStack Table 实现复杂表格交互。
   - Dashboard 组件（`src/components/dashboard/*`）：
     - 提供业务侧视图（如 Credits、Usage、Upgrade 提示），可为 Admin 扩展更多视角。

2. 运维脚本
   - `scripts/*.ts` 与 `scripts/sql/*`：
     - `backfill-lifetime-memberships.ts`、`backfill_period_key.sql`、`check_period_key_conflicts.sql` 等脚本，为数据修复与检查提供基础。

3. 领域服务
   - Admin 相关操作（如 ban/unban、Subscription/Credits 修正）应在未来通过领域服务暴露明确 API，而不是由 Admin 组件直接操作外部系统。

## 反模式（应避免）

- 在 Admin 界面中直接写 SQL 或调用外部 API，而绕过领域服务与安全校验。
- 将 Admin 操作与终端用户操作混在同一 UI 或路由中，导致权限边界模糊。
- Admin 操作缺乏任何日志或审计记录，问题发生时无法追踪。

## Checklist

- [ ] Admin 页面主要使用领域服务的高层 API，而不是直接访问数据库或外部 provider。
- [ ] 写操作（封禁、调整额度等）有明确的权限与确认机制。
- [ ] Admin 相关操作有基本的日志与审计记录。
- [ ] 运维脚本与 Admin UI 覆盖常见维护任务，互为补充。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/components/admin/*` 已提供了用户管理视图（列表、详情、过滤与分页）。
  - [x] `scripts/*` 与 `scripts/sql/*` 已为 Credits/Billing 等领域提供部分运维脚本。
- 尚待调整 / 确认
  - [ ] Admin 写操作（如 ban/unban、手动修正 Credits/Subscription）的领域服务与 UI 是否已完整设计，并具备审计能力。
  - [ ] 是否需要专门的 Admin 路由段与权限模型，防止普通用户访问 Admin 组件。
  - [ ] 运维任务（如重新发送邮件、手动触发特定 Job）是否需要通过 Admin UI 暴露安全的手动触发入口。

