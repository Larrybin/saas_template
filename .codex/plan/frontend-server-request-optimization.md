## 任务：frontend-server-request-optimization

### 背景与目标

- 聚焦浏览器前端 → 服务端的请求模式优化。
- 优先减少不必要的请求次数，其次优化数据传输体积。
- 保持在现有 Next.js App Router、Better Auth、React Query 架构内演进，遵循 KISS/YAGNI/DRY/SOLID。

### 范围

- A1：优化 `src/proxy.ts` 中间件中的会话检查逻辑，仅对需要鉴权的路由调用 `/api/auth/get-session`。
- A2：为 Credits 页新增“概览” server action + hook，将余额与即将过期积分合并为一次请求，并在 Credits 页面落地。
- B1：精简 `getUsersAction` 的返回字段，仅保留 Admin Users 页面实际需要的字段，降低响应体积。

### 实施要点

1. 中间件会话检查（A1）
   - 在 `src/proxy/helpers.ts` 中新增用于判断是否需要执行会话检查的纯函数（例如 `shouldCheckSession`），根据去掉 locale 的 pathname 判定。
   - 在 `src/proxy.ts` 的 `middleware` 中，仅当 `shouldCheckSession(pathnameWithoutLocale)` 为 `true` 时才调用 `/api/auth/get-session`；公共/营销路由跳过该调用。
   - 保持现有 `evaluateRouteAccess` 鉴权与重定向行为不变。

2. Credits 概览 action + hook（A2）
   - 在 Credits 领域中抽取/复用用于计算“即将过期积分”的查询逻辑，避免与 `get-credit-stats.ts` 重复实现。
   - 新增 `getCreditOverviewAction`（例如 `src/actions/get-credit-overview.ts`），一次返回 `balance` 与 `expiringCredits`。
   - 在 `src/hooks/use-credits.ts` 中新增 `useCreditOverview` hook，封装 React Query 调用和 envelope 处理。
   - 修改 `src/components/settings/credits/credits-balance-card.tsx` 使用 `useCreditOverview`，减少一页内对 Credits 的多次 server action 调用。

3. Users 列表字段精简（B1）
   - 在 `src/components/admin/users-page.tsx` 中梳理 Admin Users 表格实际用到的字段。
   - 在 `src/actions/get-users.ts` 中，将 `db.select().from(user)` 调整为显式字段选择，只返回上述字段。
   - 确保排序/搜索使用的字段仍然可用，类型定义保持与前端使用一致。

### 验证要点

- 营销首页和其他公共路由在浏览器 DevTools 中不再因 middleware 额外触发 `/api/auth/get-session`。
- Credits 设置页在加载余额与即将过期积分时仅产生一次相关 server action 请求，UI 行为与错误处理保持正确。
- Admin Users 页面列表展示、搜索、排序功能保持不变，请求响应 JSON 仅包含预期字段。

