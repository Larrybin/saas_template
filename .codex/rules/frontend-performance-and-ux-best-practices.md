---
title: 前端性能与用户体验优化最佳实践
description: 基于 MkSaaS 模板的前端性能与交互体验规范
---

## 适用范围

- 性能工具与 hooks：`src/ai/text/utils/performance.ts`、`src/env/client.ts`（`enablePerformanceLogs`）
- UI 组件与布局：`src/components/**/*`、`src/styles/*`
- Analytics 与监控：`src/analytics/*`、`env.example` 中 `NEXT_PUBLIC_ENABLE_PERF_LOGS`

## 设计目标

- 在保持 UI 丰富度的前提下，避免不必要的渲染与网络开销。
- 对关键交互（Dashboard、AI 工具、上传等）提供及时反馈与可感知的响应。
- 为性能问题提供可观测与调试手段（如性能日志开关）。

## 核心原则

1. **按需加载与渐进呈现**
   - 优先使用懒加载与按需加载（Lazy Loading / dynamic import）减少首屏负载。
   - 使用 Skeleton / Loading 状态在数据请求期间提供感知反馈。

2. **避免无谓重渲染**
   - 使用 memoization（`useMemo`, `useCallback`, 自定义 hooks）避免大组件的频繁重渲染。
   - 在列表与数据表中使用虚拟化或分页（当前已经有分页/排序逻辑，可评估虚拟化需求）。

3. **网络与数据性能**
   - 对频繁请求的数据使用缓存策略（SWR / React Query 或自研缓存），避免重复请求。
   - 尽量压缩不必要的 payload（只传当前视图需要的字段）。

4. **性能观测与调试开关**
   - 使用统一的性能监控工具（如 `PerformanceMonitor`）测量关键路径，并通过 env 控制日志开关。

## 实践要点（结合本仓库）

1. 性能工具
   - `src/ai/text/utils/performance.ts`：
     - 提供 `useDebounce`、`useThrottle`、`useLazyLoading`、`useMemoizedValue` 等通用性能 hooks。
     - `PerformanceMonitor` 支持对同步与异步操作的耗时测量，并通过 `NEXT_PUBLIC_ENABLE_PERF_LOGS` 控制是否输出性能日志。
     - `ImageOptimization` 与 `ContentOptimization` 提供图片与文本渲染优化工具。

2. 环境控制
   - `src/env/client.ts`：
     - 从 env 中解析 `NEXT_PUBLIC_ENABLE_PERF_LOGS`，通过 `enablePerformanceLogs` 开关控制性能日志。
   - `env.example`：
     - 包含 `NEXT_PUBLIC_ENABLE_PERF_LOGS` 并在 `docs/env-and-ops.md` 中提到该变量的用途。

3. UI 与数据表
   - Dashboard & Admin 组件（如 `src/components/dashboard/data-table.tsx`、`src/components/admin/users-table.tsx`）：
     - 已通过分页/排序/搜索等方式管理表格数据，减少一次性渲染超大数据集的可能。

## 反模式（应避免）

- 在高频交互组件中直接绑定原始事件而不做节流/防抖（如搜索框、滚动监听）。
- 在单个页面中加载所有相关模块/数据，即使用户只使用其中一小部分。
- 为了排查性能问题在生产环境中持续开启 verbose 日志，而不受 env 控制。

## Checklist

- [ ] 新增的列表/搜索/滚动等高频交互使用 `useDebounce` / `useThrottle` 等性能 hooks。
- [ ] 图片加载使用 `ImageOptimization` 工具或 Next.js `<Image>`，避免阻塞渲染与 CLS。
- [ ] 对关键用例（AI 调用、Dashboard 主要视图）使用 `PerformanceMonitor` 定期抽样性能数据。
- [ ] 性能日志只在开发或受控环境中开启，并通过 env 统一管理。

## 实施进度 Checklist

- 已基本符合
  - [x] 性能工具模块已提供常用防抖/节流/懒加载 hooks 与性能监控工具。
  - [x] Dashboard/Admin 数据表使用分页与排序，避免一次性渲染过多行。
  - [x] 性能日志开关通过 `NEXT_PUBLIC_ENABLE_PERF_LOGS` 与 `enablePerformanceLogs` 集中管理。
- 尚待调整 / 确认
  - [ ] 是否在新开发的交互密集型组件中系统性复用这些性能 hooks，而不是每次重新实现。
  - [ ] 对关键页面是否需要建立简单的“性能基线”（如首次渲染时间、交互延迟）用于回归监控。
  - [ ] 是否需要在 docs 中补充一节“性能优化建议”，指导使用这些工具与模式。

