---
title: Routes 守卫单一来源
---

## 背景
- `routes.ts` 中 `Routes` 枚举与 `protectedRoutes` / `routesNotAllowedByLoggedInUsers` 是三个独立结构，新增页面时需要手动同步，容易遗漏导致守卫失效。

## 参考最佳实践
- 《automation-good-practices》“Zen of Ansible” 强调 “Convention over configuration” 与 “Clear is better than cluttered”，鼓励以单一约定描述同一信息，降低维护复杂度。

## 方案
1. **集中路由元数据**  
   - 在 `routes.ts` 新增 `const routeMeta: Record<Routes, { protected?: boolean; disallowedWhenLoggedIn?: boolean }>`。  
   - 由脚本/函数自动生成 `protectedRoutes` 与 `routesNotAllowedByLoggedInUsers`，避免重复维护。
2. **类型安全守卫**  
   - 将 `protectedRoutes` 类型改为 `Readonly<Routes[]>`，并导出 `isProtectedRoute(route: string): route is Routes`，供 proxy/middleware 复用。
3. **lint/脚本检查**  
   - 简单脚本/单测验证 `protectedRoutes`、`routesNotAllowedByLoggedInUsers` 与 `routeMeta` 同步。
4. **文档索引**  
   - 在 `reports/routes-and-app-review.md` 与 `reports/plan.md` 中关联此计划，以便跟踪落地进度。
