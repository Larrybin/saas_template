---
title: 多环境部署与发布流程最佳实践
description: 基于 MkSaaS 模板的环境划分、配置管理与发布流程规范
---

## 适用范围

- 环境与运维：`docs/env-and-ops.md`、`env.example`、`src/env/*`
- 部署配置：`vercel.json`、`next.config.ts`、CI 配置（如 GitHub Actions / Vercel Pipelines）
- 数据与迁移：`drizzle.config.ts`、`src/db/migrations/*`

## 设计目标

- 明确开发 / 测试 / 预发 / 生产等环境的职责与差异。
- 通过 env + config 管理各环境的行为，而不是在代码中硬编码。
- 建立可重复、可回滚的部署与数据库迁移流程。

## 核心原则

1. **环境清单清晰**
   - 至少区分：
     - 本地开发（local）：开发者个人环境。
     - 测试 / CI（test）：自动化测试使用环境。
     - 预发 / Staging（stg）：接近生产的演练环境。
     - 生产（prod）：线上环境。

2. **配置不随环境流转**
   - 代码同一分支在不同环境行为差异只来自环境变量与部署配置，而非条件编译。
   - 环境变量在 `env.example` 中可见，并在 `docs/env-and-ops.md` 中有说明。

3. **迁移与发布配套**
   - 数据库迁移脚本通过统一命令执行（如 `pnpm db:migrate`）。
   - 发布前后配套运行脚本（如 `db:check-period-key`）进行健康检查。

4. **最小可用变更与回滚策略**
   - 每次发布尽量封装为小粒度变更，便于快速回滚。
   - 有清晰的“前滚 + 回滚”策略（特别是涉及 db schema 的变更）。

## 实践要点（结合本仓库）

1. 环境变量与配置
   - `env.example` 与 `src/env/*`：
     - 服务器端与客户端 env 通过 Zod 校验，避免配置缺失导致运行时错误。
   - `docs/env-and-ops.md`：
     - 对关键 env（Auth、Stripe、Storage、AI、Cron 等）以及 Webhook / Cron Job 配置有详细说明。

2. 数据库迁移与检查
   - `drizzle.config.ts` 与 `src/db/migrations/*`：
     - 管理 schema 变更与迁移。
   - `docs/period-key-operations.md` + `scripts/sql/*`：
     - 示例了一个 multi-stage rollout（backfill / check / enable）与检查命令（`pnpm db:check-period-key`）。

3. 部署与 Webhook
   - `docs/env-and-ops.md` 中 Stripe Webhook 一节：
     - 说明了各环境下 Webhook endpoint 与 secret 的配置与校验。

## 反模式（应避免）

- 为不同环境维护多份“手写配置”，而不通过 env + docs 统一管理。
- 直接在生产环境上手动执行 SQL 或临时代码，而无迁移或脚本记录。
- 在同一环境里混用测试 / 正式的 Stripe / Storage / AI 凭证。

## Checklist

- [ ] 每个环境有清晰的 env 配置与文档说明（包括 Webhook、Cron、AI Provider 等）。
- [ ] 数据库迁移脚本在所有环境中使用统一命令执行，并有失败回滚策略。
- [ ] 部署流水线中包含必要的检查步骤（如 `pnpm lint`、`pnpm test`、关键健康检查脚本）。
- [ ] 发生问题时有明确的回滚流程（包括代码与数据库）。

## 实施进度 Checklist

- 已基本符合
  - [x] `env.example` 与 `src/env/*` 已对环境变量进行集中管理与 Zod 校验。
  - [x] `docs/env-and-ops.md` 对 Webhook、Cron、日志等运维事项有详细说明。
  - [x] `docs/period-key-operations.md` 与 `scripts/sql/*` 提供了完整的分阶段 rollout + 校验 + 回滚示例。
- 尚待调整 / 确认
  - [ ] CI / 部署流水线是否已经统一执行关键检查命令，并在失败时阻断发布。
  - [ ] 是否为非 DB 变更（如 Feature Flag 调整、配置变更）也制定了“变更记录 + 回滚方案”。
  - [ ] 是否需要进一步在 docs 中补充“各环境职责与差异”一节，帮助新成员快速理解。

