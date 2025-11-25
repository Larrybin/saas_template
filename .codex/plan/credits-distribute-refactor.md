## 任务：credits 分发大函数重构（distributeCreditsToAllUsers）

### 1. 背景

- 文件：`src/credits/distribute.ts`
- 现状：
  - `distributeCreditsToAllUsers` 同时负责：
    - 运行过期处理（`runExpirationJob`）；
    - 构造 Drizzle SQL 子查询（latest payment per user）；
    - 分页查询所有用户；
    - 解析终身会员记录（`UserLifetimeMembershipRepository`）；
    - 按 plan 分类用户（free / yearly / lifetime / fallback）；
    - 调用 `CreditDistributionService` 生成并执行命令；
    - 累计 processed / errors / usersCount，贯穿整个流程写日志。
  - 函数体量 >200 行，对多个模块有硬依赖，难以单测或替换子流程。

### 2. 目标

- 保持对外 API 不变：
  - `export async function distributeCreditsToAllUsers(options?: { refDate?: Date })`
- 内部重构为“薄 orchestrator + 多个局部 helper”：
  - 通过轻量依赖注入（`DistributeCreditsDeps`）方便单测；
  - 把 SQL 查询、用户分类、三类用户的分发流程拆成小函数；
  - 主函数只负责 orchestrate、统计和顶层日志，降低认知负担。

### 3. 设计方案

1. **依赖注入层（同文件内）**

   ```ts
   export type DistributeCreditsDeps = {
     creditDistributionService: CreditDistributionService;
     lifetimeMembershipRepository: UserLifetimeMembershipRepository;
   };

   const defaultDeps: DistributeCreditsDeps = {
     creditDistributionService: new CreditDistributionService(),
     lifetimeMembershipRepository: new UserLifetimeMembershipRepository(),
   };
   ```

   - 将导出函数签名调整为：
     ```ts
     export async function distributeCreditsToAllUsers(
       options?: { refDate?: Date },
       deps: DistributeCreditsDeps = defaultDeps
     ) { ... }
     ```

2. **数据访问 helper**

   - `createLatestPaymentSubquery(db)`：构造 current latest payment 子查询。
   - `fetchUsersBatch(db, latestPaymentQuery, lastUserId, limit): Promise<UserWithPayment[]>`：
     - 抽出当前批量查询用户的逻辑，主循环只负责传入 `lastUserId` 和 `limit`。
   - `resolveLifetimeMemberships(userIds, deps.lifetimeMembershipRepository, resolvePlan)`：
     - 内部使用 `findByUserIds` + `collectValidLifetimeMemberships`；
     - 返回 `{ validMemberships, invalidMemberships, shouldFallbackToFree }`；
     - 主函数负责对 `invalidMemberships` 写日志。

3. **纯业务 helper（不依赖 logger/IO）**

   - `classifyUsersByPlan(params): { freeUserIds: string[]; lifetimeUsers: PlanUserRecord[]; yearlyUsers: PlanUserRecord[] }`：
     - 入参包括 `userBatch`、`resolvePlan`、`freePlan`、`validMemberships`、`shouldFallbackToFree`；
     - 封装现有按照 plan / paymentStatus / interval 分类用户的业务规则；
     - 不写日志、不访问外部服务，便于单测。

4. **分发 + 日志 helper**

   - `distributeForFreeUsers({ freeUserIds, freePlan, periodKey, monthLabel, batchSize, deps, log })`：
     - 负责 free 用户的 batch 切片、`generateFreeCommands` / `execute` 调用和局部日志；
     - 返回 `{ processedDelta, errorDelta }`。
   - `distributeForLifetimeUsers({ lifetimeUsers, periodKey, monthLabel, batchSize, deps, log })`：
     - 包含 `generateLifetimeCommands` 流程与日志，返回增量统计。
   - `distributeForYearlyUsers({ yearlyUsers, periodKey, monthLabel, batchSize, deps, log })`：
     - 包含 `generateYearlyCommands` 流程与日志，返回增量统计。

5. **重写 orchestrator**

   - `distributeCreditsToAllUsers` 的主要流程：
     1. 获取 logger、执行 `runExpirationJob`、建立 `db` 与 `latestPaymentQuery`；
     2. 计算 `now` / `periodKey` / `monthLabel`，解析 `freePlan`；
     3. 初始化计数器 `usersCount / processedCount / errorCount / lastProcessedUserId`；
     4. 使用 `resolvePlan = createCachedPlanResolver(findPlanByPriceId)`；
     5. 循环：
        - 调用 `fetchUsersBatch` 获取一批用户；为空则 break；
        - `usersCount += userBatch.length`；
        - 调用 `resolveLifetimeMemberships` 获取有效/无效 membership 与 fallback 标记；
        - 如有 invalid memberships → 写 error/warn 日志；
        - 调用 `classifyUsersByPlan` 获取 `freeUserIds / lifetimeUsers / yearlyUsers`；
        - 分别调用 `distributeForFreeUsers / ...LifetimeUsers / ...YearlyUsers`，累加增量统计；
        - 更新 `lastProcessedUserId`。
     6. 循环结束后写总结果日志并返回 `{ usersCount, processedCount, errorCount }`。

### 4. 验证与回归

- 重构完成后：
  - 运行 `pnpm lint`；
  - 运行 `npx tsc --noEmit`；
  - 运行 `pnpm test`，重点关注：
    - `src/credits/distribution/__tests__/credit-distribution-service.test.ts`；
    - `src/credits/expiry-job.test.ts`；
    - 以及任何间接依赖 `distributeCreditsToAllUsers` 的测试。
- 可选新增单测：
  - 针对 `classifyUsersByPlan` 构造若干 user + plan 场景，断言 free/lifetime/yearly 分类结果正确。

### 5. 优化与补充

- 类型收敛：
  - 在 `src/credits/distribute.ts` 中新增 `LifetimeMembershipResolution` 类型，统一描述：
    - `validMemberships: PlanUserRecord[]`
    - `invalidMemberships: LifetimeMembershipRecord[]`
    - `shouldFallbackToFree: boolean`
  - `collectValidLifetimeMemberships`、`resolveLifetimeMemberships` 与 `classifyUsersByPlan` 复用该类型，避免匿名类型重复。
- 单测补充：
  - 在 `src/credits/__tests__/distribute-lifetime-membership.test.ts` 中：
    - 已覆盖 `collectValidLifetimeMemberships` 与 `createCachedPlanResolver`；
    - 新增 `classifyUsersByPlan` 的用例：
      - 有有效终身会员时直接归入 `lifetimeUsers`，且不会调用 `resolvePlan`；
      - 仅存在无效会员且 `shouldFallbackToFree = true` 时，用户归入 `freeUserIds`；
      - 无会员信息时，依据 `resolvePlan` 返回的 `PricePlan`（终身 / 年付）与 `PlanIntervals.YEAR` 归类到 `lifetimeUsers` / `yearlyUsers`，其它用户归入 `freeUserIds`。

### 6. 后续可选优化（暂不实施，仅记录思路）

> 仅在未来 credits 分发逻辑进一步复杂、需要在多个 Job 之间复用“加载/划分/批处理”流程时考虑，当前版本不执行该重构。

- 模块化拆分建议（拟放在 `src/credits/distribution/` 下）：
  - `user-loader.ts`：封装 DB 访问（Drizzle + feature flag），对外提供分页获取 `UserWithPayment[]` 的函数，隐藏具体 SQL 与分页条件。
  - `user-partitioner.ts`：依据 plan / feature flag / 当前时间，将用户划分为 `free/lifetime/yearly` 三类，返回类似 `DistributionPartition` 的结构。
  - `batch-runner.ts`：通用批处理执行器，负责：
    - 将某一类用户按 batchSize 切片；
    - 调用 `CreditDistributionService` 的 `generate*Commands` + `execute`；
    - 统一累计 `processedDelta` / `errorDelta`，并处理 progress / error 日志。
  - `distribution-orchestrator.ts`（或继续使用 `src/credits/distribute.ts` 中的 `distributeCreditsToAllUsers`）：
    - 作为 orchestrator，调用 `runExpirationJob`、`user-loader`、`user-partitioner`、`batch-runner`；
    - 汇总最终的 `{ usersCount, processedCount, errorCount }`。

- 依赖注入与共享类型：
  - 定义 `DistributionContext`，包含：
    - `logger`、`periodKey`、`monthLabel`；
    - `creditDistributionService`、`lifetimeMembershipRepository` 等依赖；
  - `batch-runner` 通过参数接收 `CreditDistributionService`（而不是内部 new），与当前 `DistributeCreditsDeps` 思路一致；
  - 保持 `DistributionResult`（`{ usersCount, processedCount, errorCount }`）结构与现有 API 兼容。

- 日志与指标：
  - 将针对 free/lifetime/yearly 的进度日志统一集中到 `batch-runner` 或 orchestrator，避免分散在多处；
  - 保留 `runExpirationJob` 的前后日志在 orchestrator 中，以便串联整个任务。

- 集成方式：
  - `distributeCreditsToAllUsers` 入口签名保持不变，内部重写为：
    - `runExpirationJob` → 调用 `user-loader` 分页加载 → `user-partitioner` 划分 → 对每个分段使用 `batch-runner` → 汇总；
  - `src/app/api/distribute-credits/route.ts` 无需改动，只要入口函数签名与返回值兼容。
