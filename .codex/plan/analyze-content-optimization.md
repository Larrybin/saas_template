任务：优化 AI 内容分析链路（analyze-content 路由 + WebContentAnalyzer 组件）

上下文：
- 后端入口：`src/app/api/analyze-content/route.ts`
- 前端入口：`src/ai/text/components/web-content-analyzer.tsx`
- 相关工具：`src/ai/text/utils/*`, `src/lib/server/api-auth.ts`, `src/lib/server/rate-limit.ts`

目标：
- 降低路由文件和前端组件的复杂度，提升可测试性和可维护性。
- 通过依赖注入和自包含的 handler/hook，将核心业务逻辑从框架适配层抽离。

计划步骤：
1. 抽取后端分析 handler：
   - 在 `src/ai/text/utils` 下新增 `analyze-content-handler.ts`。
   - 移动/重构 `analysisSchema`、`withTimeout`、`truncateContent`、`scrapeWebpage`、`analyzeContent` 等逻辑到该文件。
   - 暴露一个纯业务入口（例如 `handleAnalyzeContentRequest`），输入为解析后的请求数据，输出为结构化结果和错误信息。
   - `route.ts` 仅保留：鉴权、限流、调用 handler 并包装为 `NextResponse`。

2. 为 handler 增加单元测试：
   - 新增 `src/ai/text/utils/__tests__/analyze-content-handler.test.ts`。
   - 使用 Vitest，对成功路径和典型错误分支（校验失败、Firecrawl 未配置、AI 错误）做最小集测试。

3. 抽取 WebContentAnalyzer 前端状态机：
   - 在 `src/ai/text/components` 下新增 `use-web-content-analyzer.ts`（命名可微调）。
   - 将当前组件内 reducer、请求逻辑、错误分类和 toast 调用抽到 hook 中。
   - 将 `ErrorBoundary` 抽取为可复用组件（如 `AiErrorBoundary`），`WebContentAnalyzer` 只负责组合 hook 与子视图组件。

4. 可选：为 hook 添加最小单元测试：
   - 覆盖状态流转（开始分析 -> 抓取 -> 分析 -> 成功 / 失败），不锁死 UI 结构。

验证方式：
- 通过现有 `pnpm test` 及新增测试文件验证关键路径。
- 手动调用 `/api/analyze-content` 及对应前端入口，检查行为是否与重构前一致。

