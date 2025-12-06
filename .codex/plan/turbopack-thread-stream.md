---
title: Turbopack 适配 thread-stream & Prettier 安装
created_at: 2025-02-14T00:00:00Z
---

## 背景

Vercel 在 Next.js 16.0.7 + Turbopack 环境下构建失败：

- `@react-email/render` 需要 `prettier`（`pretty: true`）但项目未安装；
- Turbopack 会尝试解析 `thread-stream` 的测试资产（`.test.*`、`.zip`、`.sh` 等），引入 `tap` 等不可用模块。

## 执行计划

1. 安装 `prettier` 为 `devDependency`，确保 `@react-email/render` 的 `pretty` 功能可用。
2. 在 `next.config.ts` 中新增 `turbopack.rules`：
   - 针对 `thread-stream/test/**`、`*.test.*`、`.zip`、`.sh`、`LICENSE`、`yarnrc.yml` 等模式设置 `loaders: []`，避免被 Turbopack 打包。
3. 验证 `pnpm build` / `pnpm lint` 通过，并在交付中说明变动。
