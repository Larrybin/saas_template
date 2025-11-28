---
title: 资源清理与后台任务（Cron / Job）最佳实践
description: 基于 MkSaaS 模板的定时任务、资源清理与内部 Job 设计规范
---

## 适用范围

- Cron 与 Job：`src/lib/server/usecases/distribute-credits-job.ts`、`src/credits/expiry-job.ts`、`src/app/api/distribute-credits/route.ts`
- 脚本与 SQL：`scripts/sql/*`、`scripts/*.ts`
- 文档：`docs/env-and-ops.md`、`docs/credits-lifecycle.md`、`docs/period-key-operations.md`

## 设计目标

- 将周期性任务（如积分分发、过期处理、数据清理）显式建模为 Usecase + Job，而非散落在业务代码中。
- 使用受保护的 API / 脚本作为 Job 入口，明确鉴权与幂等策略。
- 为 Job 提供清晰的日志、统计与运维文档。

## 核心原则

1. **Job 也是 Usecase**
   - Job 逻辑通过 Usecase 暴露（如 `distribute-credits-job`），可被 API / CLI / Worker 调用。
   - Route 或脚本只是用例入口，不应混入业务细节。

2. **鉴权与幂等**
   - 内部 Job API 使用 Basic Auth / 内部 token 保护，只对调度系统开放。
   - Job 本身通过幂等设计（如 periodKey、事件表等）防止重复执行带来不一致。

3. **可观测性与审计**
   - Job 运行需记录 jobRunId、处理总数、成功/失败数等，并写入结构化日志。
   - 在 docs 中记录 Job 的触发频率、预期行为与故障排查路径。

## 实践要点（结合本仓库）

1. Credits 分发与过期 Job
   - `src/lib/server/usecases/distribute-credits-job.ts`：
     - 封装了积分分发 Job 的 usecase，使用 `createJobLogger` 记录 jobRunId 与统计信息。
   - `src/credits/expiry-job.ts`：
     - 处理 Credits 过期逻辑，可由 Job 入口定期触发。
   - `docs/credits-lifecycle.md` 与 `docs/period-key-operations.md`：
     - 详细描述了分发与 periodKey 操作的生命周期与运维注意事项。

2. Job API 入口
   - `/api/distribute-credits`：
     - 使用 `validateInternalJobBasicAuth` 与 `CRON_JOBS_*` 凭证保护。
     - 调用 `runCreditsDistributionJob()` 并返回统计信息。
   - `docs/env-and-ops.md`：
     - 解释了如何在不同环境下配置 Cron 与内部 Job。

3. 脚本与 SQL
   - `scripts/sql/*` 与 `scripts/*.ts`：
     - 提供 backfill、check、rollback 等运维脚本，配合 Job 形成完整的生命周期管理。

## 反模式（应避免）

- 在普通 API 的 side effect 中偷偷“顺带执行”长时间 Job，而不是显式 Job 入口。
- 缺乏幂等设计，导致重复触发 Cron 产生重复扣费或重复发放。
- Job 没有任何日志与统计信息，运维无法判断执行情况。

## Checklist

- [ ] 所有长期运行或周期性任务都有独立 Usecase 与 Job 入口。
- [ ] 内部 Job API 有严格鉴权与限流策略，避免被公开访问。
- [ ] Job 的幂等性与错误恢复策略有明确说明。
- [ ] Job 运行有可观测性（日志、统计）与运维文档说明。

## 实施进度 Checklist

- 已基本符合
  - [x] Credits 分发与过期逻辑已通过 Usecase + Job + API 的模式建模，并在 docs 中记录。
  - [x] `/api/distribute-credits` 使用 Basic Auth 与 env 凭证保护，只适用于 Cron 调用。
  - [x] periodKey 与 Credits lifecycle 相关 SQL 脚本展示了复杂 Job rollout 的完整闭环。
- 尚待调整 / 确认
  - [ ] 其它可能需要定期维护的资源（如存储中的过期文件）是否也需要引入类似 Job 模式与文档。
  - [ ] 是否为所有 Job 定义了统一的命名、日志字段与监控告警策略。
  - [ ] 对 Job 的运行频率与超时限制是否在 docs 中清晰说明，避免误配置。

