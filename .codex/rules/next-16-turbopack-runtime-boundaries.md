---
title: Next 16 + Turbopack 运行时边界规则
description: 针对 Next 16.0.7 + Turbopack 的 server/client 运行时边界与 Node-only 依赖治理规范，避免 server-only / postgres / Node 内建模块泄露到客户端 bundle。
---

## 适用范围

- 框架与版本：
  - Next.js 16.0.7（启用 Turbopack）。
  - App Router 路由结构（`src/app/**`）。
- 目录范围：
  - UI 与客户端入口：
    - `src/components/**`
    - `src/hooks/**`
    - `src/app/**/page.tsx`
  - server-only 区：
    - `src/lib/server/**`
    - `src/db/**`
    - `src/payment/data-access/**`
  - 其它使用 Node-only 依赖的基础设施：
    - 例如：`src/lib/server/logger.ts`、`src/lib/server/thread-stream-stub.js` 等。

> 本规则只约束“运行时边界与依赖方向”，不改变现有领域分层（domain/usecase）的职责划分。

## 背景：为什么需要运行时边界治理

在 Next 16 + Turbopack 下，以下情况会直接导致构建失败：

- 将依赖 `postgres` / `fs` / `net` / `tls` / `perf_hooks` / `node:async_hooks` 等 Node-only 模块的代码编进浏览器端 bundle。
- 在标记了 `import 'server-only'` 的模块上建立从 Client 入口可达的依赖链。
- 在 App Route Handler（`route.ts`）里添加 `'use server'` 并导出普通常量（例如 `export const dynamic = 'force-dynamic'`），触发：
  - `Only async functions are allowed to be exported in a "use server" file.`

这些问题本质上是“server/client 运行时边界不清晰”、以及“Node-only 依赖未明确收敛”所致，本规则旨在：

- 明确哪些目录、文件属于 **Client 边界**、哪些属于 **server-only 区**。
- 约束可达性：**Client 边界不得穿透到 server-only / Node-only 代码**。
- 为脚本与 Lint 规则提供可执行的判定标准。

## 核心概念与目录分类

### Client 边界模块

满足任一条件的模块，视为 Client 边界模块：

- 文件顶部存在 `'use client'` directive。
- 文件路径位于：
  - `src/components/**`
  - `src/hooks/**`
  - 其它显式 UI 入口（例如未来新增的专用 client 目录）。

这些模块及其依赖将被 Turbopack 视为“可能被打包到浏览器端”，因此：

- 不允许直接依赖任何 server-only 区代码。
- 不允许依赖 Node-only 运行时模块（Node 内建模块、`postgres` 等）。

### Server-only 区

以下目录及其子目录视为 server-only 区：

- `src/lib/server/**`：日志、usecase、rate-limit、internal-auth 等。
- `src/db/**`：Drizzle + postgres 连接与 schema。
- `src/payment/data-access/**`：Payment 领域的数据访问与仓储实现。

server-only 区模块的特点：

- 允许使用 `import 'server-only';`。
- 允许直接依赖 Node 内建模块（`node:*`、`fs`、`net`、`tls`、`perf_hooks` 等）。
- 允许依赖 `postgres` 等 Node-only 第三方库。

但它们在依赖图中必须保持为“server-only 叶子”：**不得从任何 Client 边界模块可达**。

### Node-only 依赖

Node-only 依赖包括（但不限于）：

- Node 内建模块：
  - `import { AsyncLocalStorage } from 'node:async_hooks';`
  - `import fs from 'fs';`
  - `import net from 'net';`
  - `import tls from 'tls';`
  - `import { performance } from 'perf_hooks';`
- 第三方 Node-only 库：
  - `postgres`。
- `server-only` 标记模块：
  - `import 'server-only';`

**约定：**

- Node-only 依赖只能出现在 server-only 区或纯 server 入口（Route Handler / Server Actions）中。
- 一旦某个模块依赖了 Node-only 依赖，它本身也必须被视为 server-only，不得再被 Client 边界模块 transitively import。

## 运行时边界规则（硬约束）

### 规则 1：Client 模块不得依赖 server-only / Node-only

任一 Client 边界模块（`'use client'` 文件、`src/components/**`、`src/hooks/**` 等）不得：

- 导入 `server-only`：
  - `import 'server-only';`
- 导入 Node 内建模块：
  - 任何 `import ... from 'node:*'`
  - 任何 `import ... from 'fs' | 'net' | 'tls' | 'perf_hooks' | 'async_hooks'` 等。
- 直接导入 `postgres`：
  - `import postgres from 'postgres';`
- 导入 server-only 区入口：
  - `import ... from '@/lib/server/...';`
  - `import ... from '@/db';`
  - `import ... from '@/payment/data-access/...';`

> **说明：** 如果一个模块目前在 Client 与 Server 两侧都需要复用，则应该拆分为：
> - 一个纯 domain/类型模块（不依赖 server-only / Node-only），供 Client 与 Server 共用；
> - 一个 `.server.ts` 或放在 `src/lib/server/**` 下的 server-only 适配层，仅在 server 侧使用。

### 规则 2：Route Handler 中禁止使用 `'use server'`

对于所有 App Router 的 Route Handler 文件：

- 路径匹配：`src/app/**/route.ts`。
- **禁止**在文件顶部添加 `'use server'`。

理由：

- Route Handler 本身就是 server 代码，无需 `'use server'`。
- 在这类文件中添加 `'use server'` 后，Next 会将其视作 Server Action 文件，并拒绝导出普通常量（例如 `export const dynamic = 'force-dynamic'`），导致构建错误。

### 规则 3：server-only barrel 不能“伪装”为通用入口

禁止将 server-only 区模块通过看起来“通用”的 barrel 暴露给外部，例如：

- 反例：`src/lib/logger.ts` 仅做：
  - `export * from './server/logger';`
- 之后在其它 domain 模块中使用 `import { getLogger } from '@/lib/logger';`，再被 client 代码 import，等于间接把 `src/lib/server/logger.ts` 泄露到 Client 依赖图。

约定：

- 如果某个 barrel re-export 了 server-only 区模块，则它本身也必须被视为 server-only，仅供 server 区使用，不得被 Client 边界模块 import。
- 通用入口（例如 `@/lib/logger`）只能 re-export 纯 client-safe 模块。

## 反模式与推荐实践

### 反模式 1：在 domain 中直接使用 server-only logger / membership service

**问题模式：**

- `src/lib/auth-domain.ts` 顶层：
  - `import { getLogger } from '@/lib/logger';`
  - `import { getMembershipService } from '@/lib/server/membership-service';`
- 该模块随后被：
  - `src/components/pricing/pricing-card.tsx`、`src/components/settings/billing/billing-card.tsx` 等 `use client` 组件 import。
- 结果：
  - `postgres` / `server-only` logger / Node-only 依赖通过 domain → client 组件链路进入 client bundle，引发 Turbopack 构建错误。

**推荐实践：**

- 拆分 auth-domain：
  - `auth-domain.ts`：纯 domain + 类型 + 业务规则，不依赖 `@/lib/server/**` 或 `postgres`。
  - `auth-domain.server.ts`：位于 server-only 区，负责将 domain 规则与 DB / Membership / 访问控制适配起来。
- Client 组件只依赖 `auth-domain.ts` 中的类型/常量（例如 `AccessCapability`、`PLAN_ACCESS_CAPABILITIES`），不调用含 server-only 依赖的实现。

### 反模式 2：客户端 Hook 直接 import `'use server'` 实现文件

**问题模式：**

- `src/hooks/use-access-and-checkout.ts`（`use client` Hook）直接：
  - `import { ensureAccessAndCheckoutAction } from '@/actions/ensure-access-and-checkout';`
- `ensure-access-and-checkout.ts` 顶部使用 `'use server'`，内部依赖：
  - `@/lib/server/logger`、`@/lib/server/billing-service` 等 server-only 模块。
- Turbopack 在生成 app-client chunk 时必须解析这些 server-only 依赖，最终因为 `node:async_hooks` 等 Node-only 模块不支持而报错。

**推荐实践：**

- 对 Server Action 使用 “专用 client 调用器”，而不是随意 import 实现文件：
  - 利用 `next-safe-action` / `userActionClient` 提供的约定，让 client 只依赖经过包装的调用入口。
  - 或者显式拆分为：
    - server-only 实现模块（`'use server'` 文件，位于 server-only 区）；
    - client 调用模块：只 export 一个通过 `fetch` / `actionClient` 调用的函数，不直接导出 server-only 实现。

### 反模式 3：在 Route Handler 中混用 `'use server'` 与配置常量导出

**问题模式：**

- `src/app/api/dev/access-reconciliation/route.ts` 顶部添加：
  - `'use server';`
- 并在同一文件中导出：
  - `export const dynamic = 'force-dynamic';`
- Next 将其视为 Server Action 文件，并强制要求“只能导出 async 函数”，导致构建失败。

**推荐实践：**

- 对 Route Handler（`route.ts`）：
  - 不要添加 `'use server'` directive；
  - 只导出 HTTP handler（`export async function GET(...)` 等）与 Next 支持的 route config 常量（`dynamic` / `revalidate` 等）。
- 真正的 Server Actions 放在 `src/actions/**` 等专用目录，并通过 safe-action 统一管理。

## 执行与检查

为保证上述规则可执行，本仓库提供两类“守门人”：

1. 运行时边界检查脚本：`scripts/check-runtime-boundaries.ts`
2. Biome Lint 配置增强：对 server-only 区启用 `useNodejsImportProtocol`

### 运行时边界检查脚本（必跑）

- 命令：`pnpm check:runtime-boundaries`
- 脚本职责（摘要）：
  - 扫描 `src/**/*.ts`、`src/**/*.tsx`。
  - 将文件分类为：
    - Client 边界文件：`'use client'` 文件、`src/components/**`、`src/hooks/**`。
    - Route Handler 文件：`src/app/**/route.ts`。
  - 对 Client 边界文件：
    - 禁止 import：
      - `server-only`
      - `node:*`
      - `postgres`
      - `@/lib/server/...`
      - `@/db`
      - `@/payment/data-access/...`
  - 对 Route Handler 文件：
    - 禁止在文件顶部声明 `'use server'`。
- 任何违规将以明确的文件路径 + 行号 + 提示信息报出，并以退出码 `1` 结束，以便 CI 拦截。

### Biome 配置增强（辅助）

- 在 `biome.json` 的 `overrides` 中，对 server-only 区启用：

```jsonc
{
  "includes": [
    "src/lib/server/**",
    "src/db/**",
    "src/payment/data-access/**"
  ],
  "linter": {
    "rules": {
      "style": {
        "useNodejsImportProtocol": "error"
      }
    }
  }
}
```

- 目的：
  - 强制 Node 内建模块以 `node:` 协议显式导入（例如 `node:async_hooks`、`node:crypto`），便于审查和静态 grep。
  - 其它目录保持 `useNodejsImportProtocol: "off"`，避免对客户端代码误报。

## 流程建议

- **本地开发：**
  - 在调整 server/client 边界或引入新依赖（尤其是 logger、DB、Payment、Auth 相关模块）时：
    - 先运行 `pnpm check:runtime-boundaries`；
    - 再运行 `pnpm build` 确认 Turbopack 构建。
- **代码评审：**
  - 评审涉及 `src/lib/server/**`、`src/db/**`、`src/payment/**`、`src/lib/auth-domain.ts` 等文件的 PR 时：
    - 必须检查是否有新的依赖从 server-only 区泄露到了 Client 边界模块。
    - 必须确认 `pnpm check:runtime-boundaries` 已在本地或 CI 通过。
- **CI：**
  - 建议在 lint / test 之前增加一步：
    - `pnpm check:runtime-boundaries`
  - 将运行时边界规则提升为构建前的硬门槛，避免“只在 `pnpm build` 阶段才发现问题”。 

