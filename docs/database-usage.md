---
title: 数据库使用约定（Drizzle + postgres.js）
description: 规范本项目中对数据库的访问方式，避免驱动差异导致的错误。
---

## 总体原则

- 优先使用 Drizzle ORM 暴露的 `db` 实例，不直接在业务代码中使用 `postgres()` 原生客户端。
- 所有查询和写操作都以「返回的行」作为结果判断依据，不依赖底层驱动的元信息字段。
- 业务层、脚本层仅依赖抽象结果（比如：返回的实体、`rows.length`、显式 `count(*)`），不直接访问 `rowCount`、`affectedRows` 等字段。

## Drizzle 连接与类型

- 数据库连接入口：`src/db/index.ts`。
- 导出的类型：

  ```ts
  import type { Db } from "@/db";
  ```

- 获取连接：

  ```ts
  const db = await getDb(); // 推导为 Db
  ```

- 约定：所有使用数据库的代码应通过 `getDb()` 获取连接，避免自行创建 `postgres()` 实例。

## 查询与计数

- 查询记录：

  ```ts
  const rows = await db
    .select({ id: user.id })
    .from(user);

  const total = rows.length;
  ```

- 需要精确计数时，优先显式使用 `select count(*)`，而不是依赖驱动提供的 `rowCount` 或类似字段。

## 插入 / 更新 / 删除的最佳实践

### 插入并获取插入数量

- Postgres 场景下，使用 `returning()` 获取插入行，再用 `rows.length` 作为插入数量：

  ```ts
  const rows = await db
    .insert(userLifetimeMembership)
    .values(...)
    .onConflictDoNothing({ target: [...] })
    .returning({ id: userLifetimeMembership.id });

  const insertedCount = rows.length;
  const inserted = insertedCount > 0;
  ```

- 不使用 `rowCount`、`affectedRows` 等字段判断插入结果。

### 更新 / 删除操作

- 需要知道受影响行数时，优先使用：

  - `returning()` 返回受影响的记录，再用 `rows.length`。
  - 或显式额外执行一次 `select count(*)`（在可以接受额外查询的场景）。

- 业务层不直接访问驱动提供的 `rowCount` / `count` 等元字段。

## 何时可以使用 postgres.js 原生客户端

- 只允许在 `src/db/**` 封装层中直接使用 `postgres()` 原生客户端，例如：

  - 高级特性、性能调优。
  - 需要使用 Drizzle 暂不支持的 SQL 特性。

- 在这些封装中访问 `result.count` 等字段是允许的，但必须对外暴露「抽象结果」，例如：

  ```ts
  type RawExecResult = { affectedRows: number };
  ```

- 业务代码和脚本代码只能依赖这些抽象结果，不直接依赖底层驱动类型。

## 禁用模式（防止历史问题复发）

- 以下模式在本仓库中视为错误用法，应在评审中被拒绝：

  - 在 Drizzle 查询结果上访问 `rowCount` 属性。
  - 在业务代码中访问 `affectedRows`、`command` 等驱动元信息字段。
  - 在非 `src/db/**` 模块中直接创建 `postgres()` 客户端。

- 背景：`postgres.js` 的结果类型为「数组 + 元信息」，而 `drizzle-orm/postgres-js` 进一步包装为基于 schema 的类型。`rowCount` 是 `node-postgres (pg)` 的概念，在本项目使用的驱动栈中不存在，曾经导致 TS 类型错误。

