## 任务：Firecrawl 配置兜底改造

### 1. 背景与目标

- 背景：
  - Web 内容分析链路依赖 Firecrawl 抓取网页内容，相关配置集中在 `src/ai/text/utils/web-content-config.server.ts`。
  - `validateFirecrawlConfig` 已在 `analyze-content-handler` 的 preflight 阶段显式拦截未配置场景（返回 503 + SERVICE_UNAVAILABLE）。
  - 但 `scraper.ts` 中的 `getFirecrawlClient` 在 `apiKey` 为空时仍然构造 `new Firecrawl({ apiKey: null })`，错误行为依赖 SDK 内部，属于“隐式兜底”。

- 目标：
  - 将 Firecrawl API Key 缺失视为显式业务错误，通过 `WebContentAnalyzerError` 体系统一管理；
  - 确保即便未来有调用方绕过 preflight 直接使用 `scrapeWebpage`，也能得到语义明确、可观测的 `SERVICE_UNAVAILABLE` 错误，而非 SDK 随机异常。

### 2. 相关文件与调用链

- 配置与校验：
  - `src/env/server.ts`：从环境变量读取 `FIRECRAWL_API_KEY` 到 `serverEnv.ai.firecrawlApiKey`。
  - `src/ai/text/utils/web-content-config.server.ts`：
    - `getFirecrawlApiKey()`：返回 string | null。
    - `validateFirecrawlConfig()`：缺 key 时 `console.warn` 并返回 `false`。
  - `src/ai/text/utils/analyze-content-handler.ts`：
    - `preflightAnalyzeContentRequest()` 中调用 `validateFirecrawlConfig()`；
    - 无效时构造 `WebContentAnalyzerError(SERVICE_UNAVAILABLE, ...)` 并返回 HTTP 503。

- 抓取与分析：
  - `src/ai/text/utils/analyze-content/scraper.ts`：
    - `getFirecrawlClient()`：当前实现无显式 key 校验；
    - `scrapeWebpage(url)`：通过 `withRetry` 包裹 Firecrawl 调用并对错误做统一分类。
  - `src/ai/text/utils/error-handling.ts`：
    - 定义 `WebContentAnalyzerError`、`ErrorType.SERVICE_UNAVAILABLE`、`ErrorSeverity` 等。

### 3. 设计方案（方案 1）

> 参考《兜底逻辑设计原则.md》，将“外部服务配置缺失”视为典型兜底场景：显式决策 + 可观测性，而不是交由 SDK 内部处理。

- 方案：在 `scraper.ts` 的 `getFirecrawlClient()` 内部增加显式配置兜底：
  - 读取 `apiKey = getFirecrawlApiKey()` 后立即校验；
  - 若 `!apiKey`：
    - 抛出 `new WebContentAnalyzerError(...)`，参数：
      - `type: ErrorType.SERVICE_UNAVAILABLE`
      - `message: 'Firecrawl API key is not configured'`
      - `userMessage: 'Web content analysis service is temporarily unavailable.'`
      - `severity: ErrorSeverity.CRITICAL`
      - `retryable: false`
  - 若 `apiKey` 存在：
    - 按原逻辑构造 `new Firecrawl({ apiKey, apiUrl: webContentAnalyzerServerConfig.firecrawl.baseUrl })`。

- 行为与契约：
  - 保持 `analyze-content-handler` preflight 行为不变（仍通过 `validateFirecrawlConfig()` 在最前面返回 503）；
  - 对未来可能绕过 preflight 的调用方，提供统一的 DomainError，而不是 SDK 级异常；
  - `scrapeWebpage` 仍在 `withRetry` 中执行，由于 `retryable = false`，配置缺失不会被重试。

### 4. 具体改动计划

1. **增强 `scraper.ts` 依赖：**
   - 在 `src/ai/text/utils/analyze-content/scraper.ts` 顶部引入：
     - `WebContentAnalyzerError`
     - `ErrorType`
     - `ErrorSeverity`

2. **实现 `getFirecrawlClient` 显式兜底：**
   - 修改 `getFirecrawlClient`，在构造 Firecrawl 实例前校验 `apiKey`：
     - 缺 key → 抛 `WebContentAnalyzerError(SERVICE_UNAVAILABLE, ...)`；
     - 有 key → 正常构造 client。

3. **保持 `scrapeWebpage` 行为不变：**
   - 不变更 `scrapeWebpage` 主体结构；
   - 依赖 `withRetry` + `classifyError` 对其他异常做统一处理；
   - 期待“配置缺失”直接表现为 `WebContentAnalyzerError`，并被 handler 映射为 HTTP 503。

4. **验证：**
   - 运行与 analyze-content 相关的现有测试（特别是 `analyze-content-handler` 的 503 用例）；
   - 在本地跑一次基础检查：
     - `pnpm lint`
     - `npx tsc --noEmit`

### 5. 与兜底逻辑原则的对齐

- 兜底类型：**外部服务调用 / 配置管理**，属于推荐兜底场景；
- 边界清晰：仅在缺少 `FIRECRAWL_API_KEY` 时触发，不生成假数据；
- 可观测性：通过 `WebContentAnalyzerError` + 现有错误日志链路统一记录；
- UX 与领域数据分离：失败时直接中断分析功能，但不会伪造分析结果或修改业务状态。

