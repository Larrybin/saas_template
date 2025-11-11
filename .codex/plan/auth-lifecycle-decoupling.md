# auth-lifecycle-decoupling

## 背景
- `better-auth` databaseHooks 中直接耦合邮件、newsletter、积分逻辑，违反 SRP/DIP。
- 目标是在 `feature/auth-lifecycle-hooks` 分支上为用户生命周期副作用建立抽象，便于扩展与测试。

## 计划概览
1. **用户生命周期抽象层**：在 `src/lib/user-lifecycle/` 定义事件/Hook 类型与 `UserLifecycleManager`，支持 Promise.allSettled 与日志。
2. **业务 Hooks**：实现邮件、newsletter、credits 三个 Hook，默认组合 `defaultUserLifecycleHooks`。
3. **Auth 集成**：`src/lib/auth.ts` 注入 manager，`databaseHooks.user.create.after` 仅触发事件（含 locale）。
4. **测试/文档**：为 manager 编写 Vitest，更新 README/docs，并运行 `pnpm lint && pnpm test`。

