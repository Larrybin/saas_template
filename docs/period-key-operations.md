# Period Key Rollout Guide

## 环境变量与 Feature Flag

- `ENABLE_CREDIT_PERIOD_KEY`：Stage 3 之后仅作为**监控 / CI gate 信号**，不再参与业务逻辑分支：
  - Domain 层始终按 `AddCreditsPayload.periodKey` 写入 `credit_transaction.period_key`；
  - 幂等检查始终依赖 `period_key` 列与唯一索引，不受 flag 影响；
  - 分发服务与分发任务日志中的 `flagEnabled` / `enableCreditPeriodKey` 直接反映当前环境变量值。
- 建议：
  - Stage 3 起在所有正式环境中将 `ENABLE_CREDIT_PERIOD_KEY` 配置为 `true`；
  - 如需“关闭 periodKey 行为”，请使用**版本回滚 + rollback 脚本**，而不是简单切换 env。

## 行为语义与幂等规则

- 周期型交易类型：
  - `MONTHLY_REFRESH`（免费 plan 月度积分）
  - `SUBSCRIPTION_RENEWAL`（订阅续费积分）
  - `LIFETIME_MONTHLY`（终身计划月度积分）
- 规则：
  - 周期型交易：必须提供 `periodKey > 0`，否则 Domain 会抛出错误；
  - 非周期型交易（如 `PURCHASE_PACKAGE`、手动加点）：不得设置非 0 的 `periodKey`，否则同样抛错；
  - 数据库层通过唯一索引
    `UNIQUE (user_id, type, period_key) WHERE period_key > 0`
    保证周期内最多一条代表记录。

## 回填脚本（Stage 1）

1. 确保 migration 已运行（`period_key` 列存在）。
2. 执行 `psql $DATABASE_URL -f scripts/sql/backfill_period_key.sql` 注册函数。
3. 循环调用 `SELECT backfill_period_key_batch(5000);`（可写 shell `while` 循环），直到返回 `0`。
   - 每次调用最多更新 5000 行，并输出 `NOTICE`。
   - 如遇失败，可再次调用继续；仅影响当前批次事务。

## 回滚脚本（需要撤销时）

> 仅在需要彻底回退 periodKey 方案时使用。

1. 运行 `psql $DATABASE_URL -f scripts/sql/rollback_period_key.sql` 删除索引与字段。
2. 部署回退到不依赖 `period_key` 的版本；此时 `ENABLE_CREDIT_PERIOD_KEY` 的值不再重要。

## 冲突检查与 CI 集成

- 推荐在 Stage 2→Stage 3 切换前，以及日后例行检查时执行：
  - `pnpm db:check-period-key`
    - 封装 `scripts/sql/check_period_key_conflicts.sql`，检查：
      - `(user_id, type, period_key)` 是否存在重复；
      - 是否仍有 `period_key = 0` 的残留行。
- 若检测到冲突或残留：
  - 使用回填脚本或手工 SQL 修复；
  - 确认无冲突后再合并到生产 / 打开新版本。

## 分发任务与历史补跑

- 定时任务入口：
  - `distributeCreditsToAllUsers()`：默认使用**执行当日所在月份**作为逻辑周期：
    - `periodKey = year(now) * 100 + month(now)`；
    - 适用于日常 Cron，按当前月份发放。
- 运维补跑接口：
  - 函数签名支持传入逻辑日期：
    ```ts
    distributeCreditsToAllUsers({ refDate?: Date });
    ```
  - 示例：
    - 补发 2025 年 1 月的月度积分（无论当前日期是什么）：
      ```ts
      await distributeCreditsToAllUsers({ refDate: new Date('2025-01-01') });
      ```
    - 正常 Cron 不传参数：
      ```ts
      await distributeCreditsToAllUsers();
      ```
  - 所有 free / lifetime / yearly 的发放命令都会使用同一个 `refDate` 计算出的 `periodKey` 与 `monthLabel`，保证日志与幂等行为一致。
