---
title: 回调 URL 安全性加固
---

## 背景
- `buildSafeCallbackUrl` 仅校验 `pathname.startsWith('/')`，无法阻止 `//evil.com` 或绝对 URL，被利用时会造成开放重定向。

## 参考最佳实践
- 10up 工程实践对 HTTPS 强制重定向的示例中强调需要显式校验 host 与 protocol，确保所有跳转均保持在信任域（`/10up/engineering-best-practices`，Site-Security 文档）。

## 方案
1. **严格校验**  
   - 在 `src/proxy/helpers.ts` 中解析即将使用的 callback，拒绝 `startsWith('//')`、`URL` 构造后 host != 本站域的情况；必要时维护 allowlist。
2. **编码与日志**  
   - 对合法 path 使用 `encodeURIComponent`；对被拒绝的值记录结构化日志（含 `reason`、`originalPath`）。
3. **测试覆盖**  
   - 新增单元测试覆盖：正常路径、`..`、`//evil.com`、`http://evil.com`、带 query/hash 的合法路径。
4. **文档索引**  
   - 在 `reports/plan.md` 与本计划互相引用，说明安全策略与 allowlist 的维护方式。

## 当前状态（更新 2025-12-09）
- ✅ 严格校验：`buildSafeCallbackUrl(nextUrl)` 现基于 `nextUrl.pathname + search` 构造回调路径，仅接受以 `/` 开头的站内相对路径；对 `//evil.com` 等协议相对路径以及 `^/https?://` 形式的嵌入式绝对 URL 统一视为不安全，使用登录页（`Routes.Login`）作为安全回退。由于 callback 源自本应用的 `nextUrl`，额外的 host 校验暂不引入。  
- ✅ 编码与日志：所有合法回调路径仍通过 `encodeURIComponent` 编码；不安全路径会通过 `console.warn('Rejected unsafe callback path', { reason, originalPath })` 记录结构化日志，便于在日志平台聚合分析。  
- ✅ 测试覆盖：`tests/proxy-helpers.test.ts` 已覆盖正常路径、带 `..` 的相对路径，以及 `//evil.com`、`/http://evil.com` 等非法场景，并验证回退行为与日志输出。  
- ✅ 文档索引：`reports/plan.md` 在高优任务中引用本计划；`reports/proxy-domain-review.md` 补充“状态更新（已解决）”条目与当前实现说明，便于追踪演进。
