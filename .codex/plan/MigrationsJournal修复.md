## 任务：Drizzle Migrations Journal 修复

### 1. 问题背景

- 迁移文件列表（`src/db/migrations`）中包含：
  - `0000_fine_sir_ram.sql`
  - `0001_woozy_jigsaw.sql`
  - `0002_left_grandmaster.sql`
  - `0003_loving_risque.sql`
  - `0004_superb_siren.sql`
  - `0005_add_credit_period_key.sql`
  - `0006_add_ai_usage_table.sql`
  - `0007_add_user_lifetime_membership.sql`
- 但 `src/db/migrations/meta/_journal.json` 中的 entries 为：
  - idx 0 → `0000_fine_sir_ram`
  - idx 1 → `0001_woozy_jigsaw`
  - idx 2 → `0002_left_grandmaster`
  - idx 3 → `0003_loving_risque`
  - idx 4 → `0004_superb_siren`
  - idx 5 → `0005_add_credit_period_key`
  - idx 6 → `0007_add_user_lifetime_membership`
- 缺失了 `0006_add_ai_usage_table` 的 journal entry，且 `0007` 被记录在 idx 6。

### 2. 风险说明

- 对于依赖 Drizzle meta journal 的迁移命令而言：
  - 0006 可能永远不会被视为“已注册迁移”，从而被跳过；
  - 未来新增迁移时，可能基于错误的 idx 序列继续追加，进一步加大不一致风险。
- 从 SQL 内容看：
  - `0006_add_ai_usage_table.sql` 仅创建独立表 `ai_usage`，外键只指向已存在的 `"user"("id")`；
  - `0007_add_user_lifetime_membership.sql` 创建独立表 `user_lifetime_membership`，同样仅依赖 `"user"("id")`；
  - 二者之间无互相引用，因此顺序变更不涉及外键依赖问题，主要风险只是“是否重复执行”。

### 3. 仓库侧修复方案（统一 `_journal.json`）

> 目标：让 journal 的 entries 与文件列表一致，避免工具误判迁移顺序。

1. 保持所有迁移 SQL 文件名不变（尤其是 0006 / 0007）。
2. 修改 `src/db/migrations/meta/_journal.json`：
   - 在原 idx 5 的 entry 之后插入一个新的 entry：
     ```jsonc
     {
       "idx": 6,
       "version": "7",
       "when": 1768000000000,
       "tag": "0006_add_ai_usage_table",
       "breakpoints": true
     }
     ```
   - 将原来 idx 6 的 0007 entry 调整为 idx 7，其他字段保持不变。
3. 本地校验：
   - `pnpm lint`
   - `npx tsc --noEmit`
   - `pnpm test`

### 4. 环境侧修复思路（按环境操作）

> 仅提供思路，具体对 DB 的操作需要在对应环境中由运维/开发执行。

1. 对每个环境（本地 / dev / staging / prod）：
   - 检查 `ai_usage` 与 `user_lifetime_membership` 表是否存在；
   - 检查迁移表（如 `__drizzle_migrations`）中是否有 0006 / 0007 记录。
2. 情况分支：
   - **表存在 + 迁移表有 0006/0007**：  
     - 说明 DB 端历史是正确的，仅仓库 meta 落后；修好 `_journal.json` 即可。
   - **表存在 + 迁移表缺 0006**：  
     - 说明 0006 在该环境手动执行过；  
     - 建议在迁移表中手动插入一条 0006 的记录，标记为已执行，避免后续重复执行。
   - **表不存在 + 迁移表也无 0006/0007**：  
     - 新环境；修好 `_journal.json` 后，直接用统一命令（如 `pnpm db:migrate`）顺序执行所有迁移即可。
   - **`user_lifetime_membership` 已存在，但 `ai_usage` 不存在**：  
     - 优先在非生产环境模拟并验证执行 0006 是否安全；  
     - 在生产环境执行前务必备份 DB，再按验证过的脚本执行 0006 对应 SQL 或迁移命令。

### 5. 注意事项

- 不修改已发布迁移的 SQL 内容，以避免在不同环境间产生语义差异；
- 对生产环境的任何修复操作都应先在 staging 演练并做好备份；
- 后续新增迁移时，务必确认 `_journal.json` 与 `src/db/migrations` 同步更新，避免再次出现缺失 entry 的情况。

