## 任务：生产环境 Rate Limit 兜底修复

### 1. 背景与问题

- 文件：`src/lib/server/rate-limit.ts`
- 现状逻辑（关键部分）：
  ```ts
  const redisConfig = serverEnv.rateLimit;
  const redisRestUrl = redisConfig?.redisRestUrl;
  const redisRestToken = redisConfig?.redisRestToken;
  const requireRedis = redisConfig?.requireRedis ?? false;
  const allowInMemoryFallback = !requireRedis;
  ```
- env 映射：`src/env/server.ts`
  ```ts
  rateLimit: {
    redisRestUrl: value.UPSTASH_REDIS_REST_URL,
    redisRestToken: value.UPSTASH_REDIS_REST_TOKEN,
    requireRedis: value.RATE_LIMIT_REQUIRE_REDIS ?? false,
  },
  ```
- 结果：
  - 如果不设置 `RATE_LIMIT_REQUIRE_REDIS`，则 `requireRedis = false`，`allowInMemoryFallback = true`；
  - 当未配置 Upstash Redis（没有 URL/token）时，代码会静默退化到 “进程内内存限流”；
  - 这在 **生产 / serverless 多实例环境** 下意味着：限流只在单实例内生效，无法实现全局限流，相当于关闭了跨实例的保护。

### 2. 目标行为

- **开发 / 测试环境（`NODE_ENV` = `development` / `test`）**
  - 默认允许 in-memory fallback，方便本地/CI 无 Redis 情况下开发/跑测试；
  - 可通过 `RATE_LIMIT_REQUIRE_REDIS=true` 显式关闭 fallback，强制使用 Redis。

- **非 dev/test 环境（生产 / 预发 / 其它）**
  - 默认认为 Redis 是必须的：未配置 Redis 时应 **fail fast 抛错**，而不是静默 fallback；
  - 即使未显式设置 `RATE_LIMIT_REQUIRE_REDIS`，也应默认 `requireRedis = true`；
  - 换言之：除非显式 opt-in（未来如有需要再引入单独 env），否则生产环境不允许内存兜底。

### 3. 设计方案（不引入新 env，仅重用现有字段）

1. 调整 env 映射：
   - 文件：`src/env/server.ts`
   - 将：
     ```ts
     rateLimit: {
       redisRestUrl: value.UPSTASH_REDIS_REST_URL,
       redisRestToken: value.UPSTASH_REDIS_REST_TOKEN,
       requireRedis: value.RATE_LIMIT_REQUIRE_REDIS ?? false,
     },
     ```
     改为：
     ```ts
     rateLimit: {
       redisRestUrl: value.UPSTASH_REDIS_REST_URL,
       redisRestToken: value.UPSTASH_REDIS_REST_TOKEN,
       requireRedis: value.RATE_LIMIT_REQUIRE_REDIS, // boolean | undefined
     },
     ```
   - 这样 `serverEnv.rateLimit.requireRedis` 可以保留 `undefined`，由 rate-limit 模块根据环境计算默认值。

2. 在 `rate-limit.ts` 中基于环境决定 fallback 行为：
   - 文件：`src/lib/server/rate-limit.ts`
   - 替换现有：
     ```ts
     const redisConfig = serverEnv.rateLimit;
     const redisRestUrl = redisConfig?.redisRestUrl;
     const redisRestToken = redisConfig?.redisRestToken;
     const requireRedis = redisConfig?.requireRedis ?? false;
     const allowInMemoryFallback = !requireRedis;
     ```
   - 为：
     ```ts
     const redisConfig = serverEnv.rateLimit;
     const redisRestUrl = redisConfig?.redisRestUrl;
     const redisRestToken = redisConfig?.redisRestToken;

     const environment = process.env.NODE_ENV ?? 'development';
     const isDevOrTest = environment === 'development' || environment === 'test';

     const requireRedisFlag = redisConfig?.requireRedis;
     const requireRedis =
       typeof requireRedisFlag === 'boolean' ? requireRedisFlag : !isDevOrTest;

     const allowInMemoryFallback = !requireRedis && isDevOrTest;
     ```
   - 含义：
     - dev/test：
       - 默认（没有 env）`requireRedis = false`，`allowInMemoryFallback = true` → 允许内存兜底；
       - `RATE_LIMIT_REQUIRE_REDIS=true` 时 `requireRedis = true`，`allowInMemoryFallback = false` → dev/test 也必须 Redis。
     - 非 dev/test（生产等）：
       - 默认（没有 env）`requireRedis = true`，`allowInMemoryFallback = false` → Redis 缺失时抛错；
       - `RATE_LIMIT_REQUIRE_REDIS=false` 时 `requireRedis = false`，但 `isDevOrTest=false`，`allowInMemoryFallback=false`，仍然不启用 fallback（更安全的默认）。

3. 保持剩余逻辑不变：
   - `enforceRateLimit` 中：
     - 有 `redisClient` 时使用 Upstash 全局限流；
     - 无 `redisClient` 且 `allowInMemoryFallback=false` 时继续抛出错误：
       ```ts
       throw new Error(
         'Upstash Redis is not configured but required outside development.'
       );
       ```
     - 无 `redisClient` 且 `allowInMemoryFallback=true` 时使用内存限流，仅适用于 dev/test。

### 4. 风险与验证

- 风险：
  - 如果当前生产环境依赖“Redis 未配置也能工作”的行为，本次改动会让这类部署直接抛错（按设计这是想要的 fail fast 行为）；
  - 初次部署前应确保生产环境正确配置 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。

- 验证步骤：
  1. 本地修改完成后运行：
     - `pnpm lint`
     - `npx tsc --noEmit`
     - `pnpm test`
  2. 在本地分别模拟：
     - `NODE_ENV=development`，无 Redis 配置 → 应走内存 fallback 并打印一次 fallback 警告；
     - `NODE_ENV=production`，无 Redis 配置 → 应抛出 “Upstash Redis is not configured but required outside development.”；
     - `NODE_ENV=production`，Redis 配置齐全 → 正常通过 Upstash 限流。

