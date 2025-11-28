---
title: 配置与环境变量管理最佳实践
description: 基于 MkSaaS 模板的配置组织与环境变量安全使用规范
---

## 适用范围

- 环境变量与配置：`env.example`、`src/env/*`、`scripts/check-env.js`
- 应用级配置：`src/config/website.ts` 等
- 文档：`docs/env-and-ops.md`

## 设计目标

- 所有运行所需配置均通过类型安全的 env/config 模块读取，而不是在业务代码中直接读 `process.env`。
- 明确区分 build-time 与 runtime 配置，避免跨环境行为不一致。
- 保证本地开发 / 测试 / 生产环境的配置可控、可验证、安全。

## 核心原则

1. **集中管理环境变量**
   - 所有 `process.env.*` 访问应集中在 `src/env` 模块，由统一的 schema 校验（例如 Zod）。
   - 应用其它模块只依赖 `serverEnv` / `clientEnv` 或类似封装，而不直接读 `process.env`。

2. **区分服务器端与客户端变量**
   - 服务器端变量：只在 Node 环境可见，不以 `NEXT_PUBLIC_` 前缀暴露。
   - 客户端变量：必须以 `NEXT_PUBLIC_` 前缀，并在 env schema 中明确标注。
   - 禁止在客户端引入 server-only env 模块。

3. **配置与业务解耦**
   - 可变配置（Feature 开关、支付/分析 Provider 选择等）集中在 `src/config`。
   - 业务逻辑层通过配置接口读取，而不是在多个地方硬编码字符串或数值。

4. **验证与文档同步**
   - `env.example` 必须列出所有在代码中使用的变量，并区分必填/选填。
   - `scripts/check-env.js` 或类似脚本用于在 CI / 本地启动前校验必需变量是否存在。
   - `docs/env-and-ops.md` 解释关键变量含义与默认策略。

## 实践要点（结合本仓库）

1. 环境变量
   - `env.example`：
     - 列出了 Auth、数据库、邮件、Stripe、AI Provider、Analytics 等模块所需的 `NEXT_PUBLIC_*` 与服务端变量。
   - `src/env`：
     - 提供 `serverEnv` 等封装，供 `src/app/api/*`、`src/lib/server/*`、`src/payment/*` 读取配置。
   - `scripts/check-env.js`：
     - 在本地/CI 中用于检查关键变量的存在性与合法性。

2. 应用配置
   - `src/config/website.ts`：
     - 定义站点通用配置（如 payment provider、storage 限制、i18n 默认 locale 等），供应用与文档共同使用。
   - 其它配置文件：
     - 建议遵循相同模式，将“可变配置”与“业务逻辑”分离。

3. 文档
   - `docs/env-and-ops.md`：
     - 描述了环境、部署、运维相关的变量与推荐操作流程。

4. 测试环境下的配置覆写
   - 允许在测试中临时覆写配置，但必须：
     - 显式保存原始值，在测试结束后恢复；
     - 封装为小的 helper 函数，避免在多个测试文件中直接修改全局配置对象。
   - 示例：
     - `tests/utils/credits-config.ts` 中的 `withTestCreditsConfig`：
       - 负责在作用域内合并 `websiteConfig.credits` 覆写，然后在 finally 中恢复原值；
       - 避免在测试里直接写 `(websiteConfig as any).credits = ...` 且忘记还原。
   - 推荐：
     - 其它需要在测试中覆写的配置（如 feature flag、开关类配置）也采用类似 helper 形式集中管理。

## 反模式（应避免）

- 在业务代码中直接访问 `process.env`，绕过 `src/env` 的校验与封装。
- 在客户端代码中误用 server-only 变量，导致构建或运行时异常。
- 变量在 `env.example` 中未列出，或文档与实际使用不一致。
- 在测试中直接修改全局配置/环境变量而不恢复，导致测试之间相互污染。

## Checklist

- [ ] 代码中不再新增裸用 `process.env` 的访问点，统一通过 env 模块获取。
- [ ] 所有在代码中使用的环境变量都能在 `env.example` 中找到对应项，并带有说明。
- [ ] 配置项（Feature 开关、Provider 选择等）集中在 `src/config` 或相关配置模块中。
- [ ] 本地与 CI 都有环境变量校验步骤，以提前暴露配置缺失问题。
- [ ] 测试中如需覆写配置（如 `websiteConfig.credits`），是否通过 helper（如 `withTestCreditsConfig`）封装，并在作用域结束后恢复原值。

## 实施进度 Checklist

- 已基本符合
  - [x] `env.example` 全面列举了 Auth、数据库、支付、邮件、AI、Analytics 等关键模块的配置变量（含大量 `NEXT_PUBLIC_*` 前缀变量）。
  - [x] `src/env` 模块与 `serverEnv` 已用于在 API route 与服务端 usecase 中读取配置，例如 `serverEnv.cronJobs.*`、AI Provider 与 Stripe 配置等。
  - [x] `src/config/website.ts` 等配置文件集中定义了站点级别的 payment / storage / i18n 等参数，并被多个模块复用。
- 尚待调整 / 确认
  - [ ] 是否存在零散的 `process.env` 访问点尚未迁移到 `src/env`，需要使用 `rg` 检查并逐步收敛。
  - [ ] 所有新增的环境变量是否在 `docs/env-and-ops.md` 中同步说明，避免“隐形变量”影响部署。
  - [ ] 环境校验脚本（`scripts/check-env.js`）是否已在 CI 中强制执行，而不仅限于本地开发。
