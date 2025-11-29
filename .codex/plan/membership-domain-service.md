# 任务：Membership 域服务化（最小封装 Lifetime 能力）

## 目标

- 在 `src/domain/membership` 中从单纯仓储接口演进为完整领域服务：
  - 引入 `MembershipService` / `DefaultMembershipService`，封装当前已存在的终身会员能力：
    - `grantLifetimeMembership`（写 membership + 决策逻辑）
    - `findActiveMembershipsByUserIds`（对 Credits 分发等场景提供 Query 能力）
- 调整依赖方向：
  - `DefaultBillingService` 不再直接依赖 `LifetimeMembershipRepository`，而是依赖 `MembershipService`；
  - `credits/distribute.ts` 使用 `MembershipService` 查询 active memberships，而不是直接访问 repo。
- 在 `src/lib/server` 下增加 Membership 组合根，以对齐 Billing/Credits 的 server-level 工厂模式。

## 设计概览（方案 1）

1. **Membership 领域服务**
   - 新文件：`src/domain/membership/membership-service.ts`
     - `MembershipService` 接口：
       - `grantLifetimeMembership({ userId, priceId, cycleRefDate?, transaction? }): Promise<void>`
       - `findActiveMembershipsByUserIds(userIds: string[], db?: unknown): Promise<LifetimeMembershipRecord[]>`
     - `DefaultMembershipService` 实现：
       - 构造函数依赖 `LifetimeMembershipRepository<DbExecutor>`；
       - `grantLifetimeMembership` 内部：
         - 从可选 `CreditsTransaction` 中用 `resolveExecutor` 提取 `DbExecutor`；
         - 调用 `lifetimeMembershipRepository.upsertMembership` 完成写入；
       - `findActiveMembershipsByUserIds` 直接委托给 `repository.findActiveByUserIds`。
   - `src/domain/membership/index.ts` 导出 `MembershipService` / `DefaultMembershipService`。

2. **Membership server 组合根**
   - 新文件：`src/lib/server/membership-service.ts`
     - 定义 `MembershipServiceFactoryOverrides`：
       - `membershipRepository?: LifetimeMembershipRepository<DbExecutor>`
     - `createMembershipService(overrides?)`：
       - 默认使用 `new UserLifetimeMembershipRepository()` 实现 `LifetimeMembershipRepository<DbExecutor>`；
       - 返回 `new DefaultMembershipService({ lifetimeMembershipRepository })`。
     - `getMembershipService(overrides?)`：
       - 与 `getBillingService` 相同模式：无 overrides 时缓存单例，有 overrides 时按覆盖参数创建一次性实例。

3. **BillingService 依赖 MembershipService**
   - `src/domain/billing/billing-service.ts`：
     - 将 `import type { LifetimeMembershipRepository }` 替换为 `import type { MembershipService }`；
     - `BillingServiceDeps`：
       - 从 `lifetimeMembershipRepository: LifetimeMembershipRepository` 改为 `membershipService: MembershipService`；
     - `DefaultBillingService`：
       - 字段 `private readonly membershipService: MembershipService`；
       - 构造函数保存 `deps.membershipService`；
       - `grantLifetimePlan`：
         - 保持 credits 逻辑不变；
         - 删除 `resolveExecutor` 和直接调用 `lifetimeMembershipRepository.upsertMembership`；
         - 改为调用：
           ```ts
           await this.membershipService.grantLifetimeMembership({
             userId: input.userId,
             priceId: input.priceId,
             cycleRefDate: refDate,
             transaction: input.transaction,
           });
           ```

4. **Billing server 组合根注入 MembershipService**
   - `src/lib/server/billing-service.ts`：
     - 引入 `MembershipService` 与 `createMembershipService`；
     - `BillingServiceFactoryOverrides` 扩展为：
       - `Partial<BillingServiceDeps> & { membershipService?: MembershipService }`
     - `createBillingService` 中：
       - 计算：
         ```ts
         const membershipService =
           overrides.membershipService ?? createMembershipService();
         ```
       - 构造 `DefaultBillingService` 时传入 `membershipService`。

5. **Credits 分发使用 MembershipService 查询**
   - `src/credits/distribute.ts`：
     - `DistributeCreditsDeps`：
       - 从 `lifetimeMembershipRepository: UserLifetimeMembershipRepository` 改为 `membershipService: MembershipService`
     - `defaultDeps`：
       - 从 `new UserLifetimeMembershipRepository()` 改为 `createMembershipService()`；
     - `resolveLifetimeMemberships`：
       - 将：
         ```ts
         const membershipsInBatch =
           await deps.lifetimeMembershipRepository.findActiveByUserIds(userIds, db);
         ```
         替换为：
         ```ts
         const membershipsInBatch =
           await deps.membershipService.findActiveMembershipsByUserIds(userIds, db);
         ```

6. **测试调整**
   - `src/domain/billing/__tests__/billing-service.test.ts`：
     - 构造 `DefaultBillingService` 时传入 `membershipService` stub 而非 `lifetimeMembershipRepository`；
     - `membershipService` stub 实现：
       - `grantLifetimeMembership` / `findActiveMembershipsByUserIds` 为 `vi.fn()`；
     - 保持对 executor 传递的断言：从 `membershipService.grantLifetimeMembership.mock.calls` 中获取 `transaction.unwrap()` 结果校验。
   - `src/domain/billing/__tests__/billing-to-credits.integration.test.ts`：
     - 同样注入 `membershipService` stub；
     - 针对 lifetime 场景，验证 `grantLifetimeMembership` 被正确调用。

7. **文档小幅同步（如需要）**
   - 在 `docs/credits-lifecycle.md` / `docs/payment-lifecycle.md` 中，将「Billing 直接写 UserLifetimeMembershipRepository」更新为「通过 MembershipService.grantLifetimeMembership」的表述，以保持与实现一致。

