---
title: Turbopack 适配 thread-stream & Prettier 安装
created_at: 2025-02-14T00:00:00Z
---

## 背景

Vercel 在 Next.js 16.0.7 + Turbopack 环境下构建失败：

- `@react-email/render` 需要 `prettier`（`pretty: true`）但项目未安装；
- Turbopack 会尝试解析 `thread-stream` 的测试资产（`.test.*`、`.zip`、`.sh`、`LICENSE` 等），引入 `tap` 等仅存在于 `thread-stream` devDependencies 的模块；
- 即便忽略这些测试/资产文件，Turbopack 在分析 `thread-stream` 对 `worker_threads` 的依赖时仍会在 Nft 阶段触发内部错误。

## 执行计划（已实施方案记录）

1. 安装 `prettier` 为 `devDependency`，确保 `@react-email/render` 的 `pretty` 功能可用。
2. 在 `next.config.ts` 中新增 `turbopack.rules`：
   - 针对 `thread-stream/test/**`、`*.test.*`、`.zip`、`.sh`、`yarnrc.yml`、`LICENSE`、`bench.js` 等模式使用 `empty-loader` + `as: '*.js'`，避免这些资产被 Turbopack 当作正常模块处理。
3. 在 `next.config.ts` 中通过 `turbopack.resolveAlias` 将 `thread-stream` 指向本地 stub：`src/lib/server/thread-stream-stub.js`，仅保留 `pino` 当前依赖的最小接口（`ready` 事件、`write`/`flush`/`flushSync`/`end`/`ref`/`unref`/`closed`）。
4. 验证 `pnpm build` / `pnpm lint` 通过，并在 `docs/error-logging.md` 与 `docs/developer-guide.md` 中记录该兼容层与后续关注点（升级 Next.js / Turbopack / pino 时优先检查此处）。
