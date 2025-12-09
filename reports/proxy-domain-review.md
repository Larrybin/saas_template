# 代理域审查报告（静态审查）

## 基线
- 路由守卫与重定向安全：仅允许相对路径、拒绝开放重定向。

## 评分矩阵（1–5）
- 正确性与鲁棒性 4
- 可读性 4
- 一致性 3.5
- 复杂度 4
- 性能 4
- 安全性 4（回调校验已加固）
- 可测试性 3.5（易测但仅覆盖核心用例）
- 扩展性 3
- 依赖与边界 4
- 日志与可观测性 2.5
- 测试覆盖 3

## 发现表（复核 2025-12-09）
- 中 | src/proxy/helpers.ts:136-165 | `buildSafeCallbackUrl` 仍仅判断 `startsWith('/')`，`//evil.com` 依旧会被接受并编码；开放重定向风险未解 | 安全性 | 基线：重定向安全
- 低 | 同文件 | 守卫/回调判定仍无结构化日志/metrics，无法追踪决策 | 可观测性 | 基线：可观测性

## 测试缺口表
- 回调 URL：非法 `next`（`//`、绝对 URL）应拒绝。
- 路由守卫：受保护/禁止路由、locale 前缀、尾斜杠。
- Cookie 检测：后缀匹配。

## 建议表
- 高 | 强化回调校验：仅允许相对路径且拒绝 `//`、绝对 URL，可选 allowlist | 依据：helpers.ts:85-95
- 中 | 为守卫/回调添加单元测试；决策日志/metrics（路径、登录状态、决策） | 依据：helpers.ts
- 低 | protected/disallowed 路由集中生成，避免多处硬编码 | 依据：helpers.ts 路由集构造

## 状态更新（已解决）
- ✅ 回调 URL 校验：`buildSafeCallbackUrl` 现仅接受站内相对路径，对 `//evil.com` 等协议相对路径及以 `http://`/`https://` 开头的嵌入式绝对 URL 统一视为不安全，回退至登录页（`Routes.Login`），并通过 `console.warn('Rejected unsafe callback path', { reason, originalPath })` 输出结构化日志（`src/proxy/helpers.ts`）。  
- ✅ 单元测试：`tests/proxy-helpers.test.ts` 已覆盖正常路径、带 `..` 的相对路径以及上述非法场景，防止回归。

## 简短摘要
核心风险是回调校验不严导致潜在开放重定向；目前已在 helper 层加固校验并补充测试与日志，后续仍可在路由元数据与 metrics 维度继续演进。***
