---
title: 本地开发数据与种子（Seed）管理最佳实践
description: 基于 MkSaaS 模板的本地数据初始化与演示数据管理规范
---

## 适用范围

- SQL 与脚本：`scripts/sql/*`、`scripts/*.ts`
- 测试与本地数据：`tests/*`、`src/credits/expiry-job.test.ts` 等
- 文档：`docs/env-and-ops.md`（部分运维与脚本说明）

## 设计目标

- 为本地开发与演示提供可重复初始化的数据集。
- 区分“结构迁移”（schema）与“数据种子”（seed），避免混在迁移脚本中。
- 保证 Seed 脚本幂等或可安全反复执行。

## 核心原则

1. **Schema 迁移与 Seed 分离**
   - Schema 变更由迁移系统管理（如 Drizzle migrations）。
   - Seed 脚本只负责插入/更新演示数据，不做结构变更。

2. **幂等与可控**
   - Seed 脚本要么幂等（多次运行无副作用），要么明确采用“清理后重建”的模式。
   - 避免 Seed 脚本在生产环境误执行，必要时增加环境保护。

3. **环境感知**
   - 区分本地开发 Seed 与测试 Seed：
     - 测试数据更偏向最小集、可重复构造。
     - 本地 Seed 可稍丰富，用于手动体验功能。

## 实践要点（结合本仓库）

1. SQL 与脚本
   - `scripts/sql/backfill_period_key.sql` + `rollback_period_key.sql`：
     - 虽然主要用于数据迁移，但体现了以脚本形式管理数据更新的模式。
   - `scripts/backfill-lifetime-memberships.ts`：
     - 为特定场景（终身会员）提供批量更新脚本，可参考其模式编写 Seed 或 backfill 脚本。

2. 测试数据
   - 许多 `__tests__` 使用工厂或固定 fixture 构造 Credits / Billing / AI 相关测试数据。
   - 可以将其中复用价值高的部分提炼为专用测试数据构造工具。

## 反模式（应避免）

- 在迁移脚本中硬编码大量“环境特定”数据，导致回滚困难。
- 在生产环境运行本地开发 Seed 脚本，污染真实数据。
- 缺乏任何脚本或文档说明，开发者需要手工构造数据才能跑通主要流程。

## Checklist

- [ ] 本地开发有推荐的 Seed/Backfill 脚本与使用说明（README / docs）。
- [ ] Seed 脚本与迁移脚本职责清晰、不混用。
- [ ] 对可能误改生产数据的脚本有明确的安全保护（如环境检查）。
- [ ] 常见测试场景有可复用的数据构造工具或 fixture。

## 实施进度 Checklist

- 已部分体现
  - [x] periodKey 与 lifetime memberships 相关脚本展示了通过脚本批量更新数据的模式。
  - [x] 领域与 usecase 测试中存在较多手动构造的数据集，可作为未来 Seed / fixture 工具的基础。
- 尚待调整 / 确认
  - [ ] 是否需要为“本地开发体验”设计一套专门的 Seed 流程（例如 `pnpm db:seed:local`），快速准备典型用户/订阅/积分/AI 调用数据。
  - [ ] 是否需要在 `docs/env-and-ops.md` 或 README 中补充“如何初始化本地数据”的章节。
  - [ ] 对潜在影���生产的数据脚本是否加上环境/确认防护。

