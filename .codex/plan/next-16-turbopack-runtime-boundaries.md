---
title: Next 16 + Turbopack 运行时边界治理
description: 在 Next 16.0.7 + Turbopack 下，为避免 server-only / postgres / Node 内建模块泄露到客户端 bundle，补齐运行时边界规则文档、检查脚本与 Lint 配置。
---

## 0. 范围与前提

- 框架与工具链：
  - Next.js 16.0.7，启用 Turbopack。
  - App Router（`src/app/**`）。
  - Biome 作为统一 Lint / Format 工具。
- 本计划聚焦于：
  - 沉淀“Next 16 + Turbopack 下 server/client 运行时边界”的显式规则；
  - 制定并实现最小可用的自动化检查（脚本 + Biome 配置）；
  - 不直接重构现有业务代码（auth-domain / checkout / logger 等），只为后续重构提供治理基础。

非目标（本计划不做）：

- 不在本计划中大规模改动 `src/lib/auth-domain.ts`、`src/components/pricing/**` 等现有实现；
- 不引入新的 Lint 工具（继续基于 Biome + 自定义脚本）。

---

## 1. 运行时边界规则文档

**目标：** 在 `.codex/rules` 中新增一份规则文档，系统化描述：

- 哪些目录/文件视为 **Client 边界**，哪些视为 **server-only 区**；
- 哪些 import 在 Client 边界中被视为“硬禁止”（`server-only`、`node:*`、`postgres`、`@/lib/server/**` 等）；
- Route Handler（`route.ts`）在 Next 16 + Turbopack 下的 `'use server'` 限制；
- 典型反模式与推荐实践（以当前仓库踩过的坑为例）。

**实施要点：**

- 新增文件：`.codex/rules/next-16-turbopack-runtime-boundaries.md`；
- 结构参考本仓已有 `*-best-practices.md`：
  - 元信息（title/description）；
  - 适用范围；
  - 背景与问题； 
  - 核心概念（Client 边界 / server-only 区 / Node-only 依赖）； 
  - 运行时边界规则（硬约束）； 
  - 反模式与推荐实践（结合本仓实际案例）； 
  - 执行与检查（脚本 + Biome）。

---

## 2. 运行时边界检查脚本

**目标：** 提供一个可在本地与 CI 中执行的脚本，**静态** 检查常见的 server/client 运行时越界问题。

**职责：**

- 文件扫描：
  - 遍历 `src/**/*.ts`、`src/**/*.tsx`（排除 `node_modules`、`.next`、`tests/**` 等）。
- 文件分类：
  - Client 边界文件：
    - 顶部包含 `'use client'`；
    - 或路径位于 `src/components/**`、`src/hooks/**`。
  - Route Handler 文件：
    - 路径匹配 `src/app/**/route.ts`。
- 检查规则：
  - 对 Client 边界文件：
    - 禁止 import：
      - `"server-only"`；
      - 任意 `"node:*"` 内建模块；
      - `"postgres"`；
      - `"@/lib/server/..."`；
      - `"@/db"`；
      - `"@/payment/data-access/..."`。
  - 对 Route Handler 文件：
    - 禁止在文件顶部使用 `'use server'`。

**技术实现：**

- 新增脚本：`scripts/check-runtime-boundaries.ts`；
- 使用 `typescript` AST：
  - 解析文件，判断 directive（`'use client'` / `'use server'`）；
  - 读取 `ImportDeclaration.moduleSpecifier`；
  - 通过 `ts.getLineAndCharacterOfPosition` 报告精确行列；
- 输出格式：
  - `ERROR [runtime-boundaries] path/to/file.tsx:line:column message`；
  - 汇总错误数，非零则进程退出码为 `1`。

---

## 3. Biome 配置增强

**目标：** 通过 Biome 对 server-only 区的 Node-only 依赖进行显式约束，辅助代码评审与 grep。

**措施：**

- 在 `biome.json` 的 `overrides` 中新增一段：

  - `includes`：`"src/lib/server/**"`, `"src/db/**"`, `"src/payment/data-access/**"`；
  - `linter.rules.style.useNodejsImportProtocol = "error"`。

**效果：**

- 在 server-only 区强制 Node 内建模块使用 `node:` 协议导入：
  - 例如：`import { AsyncLocalStorage } from 'node:async_hooks';`；
- 其它目录保持 `useNodejsImportProtocol: "off"`，避免对客户端代码误报；
- 配合运行时边界检查脚本，使 Node-only 依赖在代码层表达更加显式。

---

## 4. npm 脚本与工作流集成

**目标：** 将运行时边界检查接入本地与 CI 工作流。

**实施要点：**

- 在 `package.json` 中新增脚本：
  - `"check:runtime-boundaries": "tsx scripts/check-runtime-boundaries.ts"`。
- 在 `.codex/rules/next-16-turbopack-runtime-boundaries.md` 中明确：
  - 本地调试 server/client 边界时，优先运行：
    - `pnpm check:runtime-boundaries`；
    - 再运行 `pnpm build` 进行构建验证。
- CI 集成建议：
  - 在 lint / test 流程前增加一步：
    - `pnpm check:runtime-boundaries`；
  - 将运行时边界规则作为构建前的硬门槛。

---

## 5. 结束条件

当满足以下条件时，本计划视为完成：

- `.codex/rules/next-16-turbopack-runtime-boundaries.md` 已创建，并覆盖：
  - Client 边界 / server-only 区 / Node-only 依赖的定义；
  - 运行时边界硬约束；
  - 至少 2–3 个结合本仓实际的反模式与推荐实践；
  - 执行与检查说明（脚本 + Biome）。
- `scripts/check-runtime-boundaries.ts` 已实现并可在本地运行：
  - 对 Client 边界文件的 import 限制生效；
  - 对 `route.ts` + `'use server'` 的误用给出明确错误；
  - 输出格式统一、可被 CI 日志检索使用。
- `biome.json` 已对 server-only 区启用 `useNodejsImportProtocol: "error"`，其余目录保持原有配置。
- `package.json` 中存在并可执行：
  - `"check:runtime-boundaries"` 脚本。
- 至少一次在本地成功运行 `pnpm check:runtime-boundaries`，确认脚本能在当前代码库上正常完成扫描与报告。 

