# Period Key Rollout Guide

## 环境变量
- `ENABLE_CREDIT_PERIOD_KEY=false`：Stage 1 默认值，仅写 `period_key = 0`，兼容旧逻辑。
- Stage 2 开始前，将变量设置为 `true` 并重启服务，观察日志/指标（见下）。

## 回填脚本（Stage 1）
1. 确保 migration 已运行（`period_key` 列存在）。
2. 执行 `psql $DATABASE_URL -f scripts/sql/backfill_period_key.sql` 注册函数。
3. 循环调用 `SELECT backfill_period_key_batch(5000);`（可写 shell `while` 循环），直到返回 `0`。
   - 每次调用最多更新 5000 行，并输出 `NOTICE`。
   - 如遇失败，可再次调用继续；仅影响当前批次事务。

## 回滚脚本（需要撤销时）
1. 运行 `psql $DATABASE_URL -f scripts/sql/rollback_period_key.sql` 删除索引与列。
2. 恢复 `ENABLE_CREDIT_PERIOD_KEY=false`，重新部署。

## Feature Flag 监控
- `CreditDistributionService` 初始化时会记录 `enableCreditPeriodKey` 状态。
- `creditDistributionService.execute` 的返回结果会包含 `flagEnabled`，并在 `distribute.ts` 日志中打印：
  ```
  info  credits.distribute  {..., flagEnabled: true}  "Finished batch"
  ```
- 打开 flag 前后请观察：
  - Cron 日志中 `flagEnabled` 是否与预期一致。
  - 若出现唯一索引冲突，使用回填脚本定位并修复相关记录。
