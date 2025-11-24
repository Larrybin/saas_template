## 任务：拆分 analyze-content-handler.ts

### 背景
- 当前 `src/ai/text/utils/analyze-content-handler.ts` 超过 500 行，集成了抓取、Provider 选择以及 AI 调用流程。
- 目标：拆分为 `scraper.ts`、`provider-factory.ts`、`content-analyzer.ts`，并保持现有导出兼容。
- 参考：TypeScript Style Guide 建议按职责拆分模块并通过命名导出聚合。

### 执行计划
1. **目录 & 文件初始化**
   - 创建 `src/ai/text/utils/analyze-content/` 子目录。
   - 拆出三个模块：
     - `scraper.ts`：Firecrawl 客户端、截断逻辑、withRetry。
     - `provider-factory.ts`：根据 `ModelProvider` 返回模型实例/参数。
     - `content-analyzer.ts`：调用 provider 并封装 `generateObject`、错误处理。
   - 建立 `index.ts` 导出上述函数，供 handler 使用。
2. **更新 handler**
   - 精简 `analyze-content-handler.ts`，保留类型、配置与主流程。
   - 从新模块导入 `scrapeWebpage/analyzeContent`，默认依赖通过 `defaultDeps` 注入。
   - 确保 `preflightAnalyzeContentRequest`、`handleAnalyzeContentRequest` 等导出维持原签名。
3. **引用与常量**
   - 检查本目录内其他文件（如 `error-handling.ts`、usecases）是否需要新的导出；若无必要，继续依赖 handler。
   - 如有公共常量（timeout、schema），视情况保留在 handler 或提至 `analyze-content/constants.ts`。
4. **验证**
   - 运行 `pnpm lint`、`npx tsc --noEmit`；如存在相关测试，执行 `pnpm test -- <target>`.
5. **提交**
   - 以 `feat: split analyze content handler` 为主题提交，并准备 PR 描述现有导出不变、拆分模块职责等。
