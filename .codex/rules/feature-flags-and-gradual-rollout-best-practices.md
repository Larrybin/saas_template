---
title: Feature Flag 与灰度发布最佳实践
description: 基于 MkSaaS 模板的 Feature Flag 使用与渐进发布规范
---

## 适用范围

- Feature Flag 相关 env：`env.example` 中的功能开关（如 `ENABLE_CREDIT_PERIOD_KEY`）
- 领域文档：`docs/period-key-operations.md`
- 相关领域模块：`src/credits/*` 等（依赖 periodKey 的逻辑）

## 设计目标

- 使用 Feature Flag 控制新特性启用，而不是通过条件编译或临时分支。
- 为高风险变更设计多阶段 rollout 方案（实验 → 部分环境 → 全面启用）。
- 将 Flag 长期视为“运维控制工具”，避免成为永久逻辑分支。

## 核心原则

1. **Flag 驱动配置，不驱动业务规则**
   - 领域逻辑应尽量根据配置 / payload 决定行为，而非到处读 env。
   - Feature Flag 更适合作为“是否启用某个新策略”的外层开关。

2. **生命周期管理**
   - 引入新 Flag 时：
     - 文档说明其语义、默认值与计划淘汰时间。
   - 完成全量启用后：
     - 逐步移除依赖该 Flag 的分支与 env 本身，避免“永久 feature flag”。

3. **多阶段发布**
   - 典型阶段（参照 periodKey rollout）：
     - Stage 1：schema 准备与数据回填（DB 层支持）。
     - Stage 2：部分环境启用 Flag，下游逻辑分支启用但可回滚。
     - Stage 3：全环境强制使用新行为，Flag 仅作为监控信号。

4. **观测与校验**
   - 对 Flag 控制的行为加入监控与校验脚本（如 `db:check-period-key`），确保数据符合预期。

## 实践要点（结合本仓库）

1. Credits periodKey rollout
   - `docs/period-key-operations.md`：
     - 记录了 `ENABLE_CREDIT_PERIOD_KEY` 的语义与阶段性使用方式。
   - SQL 脚本与检查命令：
     - `scripts/sql/backfill_period_key.sql`、`check_period_key_conflicts.sql`、`rollback_period_key.sql`。
   - 设计思路：
     - Stage 3 之后 Flag 仅用于监控 / CI gate，不再改变 Domain 行为。

2. 其它潜在 Flag
   - 可以参考 periodKey 的模式，为未来高风险变更（如 AI Provider 切换、Billing 策略升级等）设计 Flag 与 rollout 文档。

## 反模式（应避免）

- 在各处直接读取 env Flag 决定关键业务逻辑，而不通过配置层或文档约束。
- 引入 Flag 后长期不清理，导致代码路径爆炸与行为难以预测。
- 不为高风险 Flag 设计“数据检查 + 回滚脚本”，只依靠“改回 env 值”作为唯一回滚手段。

## Checklist

- [ ] 每个 Feature Flag 都在 docs 中有明确语义说明与计划淘汰策略。
- [ ] 高风险变更使用多阶段 rollout（准备 / 实验 / 全量）而非一次性切换。
- [ ] Flag 控制的行为都有观测与检查机制支撑。
- [ ] 旧 Flag 在完成使命后及时移除，避免成为长期技术债。

## 实施进度 Checklist

- 已基本符合
  - [x] `ENABLE_CREDIT_PERIOD_KEY` 与对应的 periodKey rollout 文档与脚本为 Feature Flag 管理提供了标准范式。
- 尚待调整 / 确认
  - [ ] 未来新增的 Feature Flag 是否都按类似范式设计（含 docs、脚本与清理计划），而不是一次性临时开关。
  - [ ] 是否需要在 `.codex/rules` 或 `docs/env-and-ops.md` 中增加“Feature Flag 总览”，便于全局管理。

