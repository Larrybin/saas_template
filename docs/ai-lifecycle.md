# AI 模块生命周期与边界说明

> 本文聚焦 AI 文本分析 / Chat / 图片生成三个核心用例的端到端生命周期，以及与 Credits / Payment / Storage / 外部 AI 提供方之间的边界关系。  
> 架构总览与模块分布请参考：`docs/architecture-overview.md` 与 `docs/feature-modules.md`。

---

## 1. 模块职责与分层

AI 模块主要职责：

- 文本分析（Web Content Analyzer）：抓取网页内容并调用多种模型进行结构化分析。  
- Chat：提供带积分扣费与日志追踪的 Chat Streaming 能力。  
- 图片生成：封装多 provider（OpenAI / Fireworks / Replicate / FAL）的图片生成接口，并统一错误模型。

分层约定：

- UI 层：`src/app` + `src/components` + `src/ai/*/components`  
  - 组件与页面负责展示与交互，不直接操作外部 SDK 或数据库。  
  - 数据请求通过 API Routes 或 Server Actions 进行。
- API / Actions：`src/app/api/*` + `src/actions/*`  
  - 负责鉴权（`ensureApiUser`）、限流（`enforceRateLimit`）、请求校验、日志上下文与 JSON envelope。  
  - 不直接实现复杂业务流程，而是调用 usecase 或领域服务。
- Usecase：`src/lib/server/usecases/*`  
  - 编排 Credits 扣费 / 免费额度 / 调用 AI provider / 映射结果。  
  - 不依赖 `NextRequest/Response`，仅使用普通参数和 DomainError。
- AI 领域工具：
  - 文本分析：`src/ai/text/utils/*`  
  - 图片生成：`src/ai/image/lib/*`  
  - 计费规则：
    - 配置源：`src/config/website.tsx` 中的 `websiteConfig.ai.billing.*`  
    - 策略层：`src/ai/billing-policy.ts`（`AiBillingPolicy` / `DefaultAiBillingPolicy`）  
    - 适配器：`src/ai/billing-config.ts`（向 usecase 暴露 `getAi*BillingRule`）  
  - 使用量统计：`src/ai/usage/ai-usage-service.ts`

---

## 2. 文本分析生命周期（Web Content Analyzer）

### 2.1 典型调用链

1. **前端调用**：
   - Hook：`src/ai/text/components/use-web-content-analyzer.ts`  
     - UI 通过 Hook 调用 `/api/analyze-content`，并消费 `{ success, error, code, retryable }` envelope。  
     - 错误处理通过 `useAiErrorUi` 与错误 UI registry 实现，详见 `docs/error-logging.md`。

2. **API Route**：`src/app/api/analyze-content/route.ts`
   - 步骤：
     - 使用 `createLoggerFromHeaders` + `resolveRequestId` 建立 logger 与 `requestId`。  
     - 使用 `ensureApiUser` 做鉴权，失败返回标准 401 envelope。  
     - 使用 `enforceRateLimit` 控制请求频率（scope: `analyze-content`）。  
     - `req.json()` 解析 body，JSON 解析失败时返回 `ANALYZE_CONTENT_INVALID_JSON` 错误。  
     - 调用 `validateAnalyzeContentRequest` 和 `preflightAnalyzeContentRequest`，进行请求体与 URL 校验。  
     - 通过 `withLogContext({ requestId, userId })` 调用 usecase `analyzeWebContentWithCredits`。

3. **Usecase**：`src/lib/server/usecases/analyze-web-content-with-credits.ts`
   - 责任：
     - 结合 AI 计费规则与 Credits 状态，决定是否扣积分。  
     - 调用 `handleAnalyzeContentRequest`（见下一节）执行真实的抓取与分析。  
     - 将结果映射为 `{ status, response }`，供 API Route 直接返回。

4. **领域工具**：`src/ai/text/utils/analyze-content-handler.ts`
   - `preflightAnalyzeContentRequest`：
     - 使用 `analyzeContentRequestSchema` 校验 body。  
     - 使用 `validateUrl` 校验 URL，并检查 Firecrawl 配置（通过 `validateFirecrawlConfig`）。  
     - 遇到错误时创建 `WebContentAnalyzerError`，通过 `logAnalyzerErrorServer` 记录，并返回标准错误 envelope（含 `code` / `retryable`）。  
   - `handleAnalyzeContentRequest`：
     - 使用 `getLogger({ span: 'ai.web-content-analyzer', requestId })` 记录开始/结束日志。  
     - 在 `withTimeout` 包裹下调用 `scrapeWebpage` 和 `analyzeContent`：  
       - `scrapeWebpage`：抓取网页内容与截图。  
       - `analyzeContent`：调用选定模型进行分析。  
     - 捕获错误：  
       - `WebContentAnalyzerError` 直接抛出；  
       - 其他错误通过 `classifyError` 转换为对应的 `WebContentAnalyzerError`，统一附带 `code` / `userMessage` / `retryable`。  
     - 最终返回：
       - 成功：`{ status: 200, response: { success: true, data: { analysis, screenshot? } } }`  
       - 失败：`{ status, response: { success: false, error, code, retryable } }`

### 2.2 错误与 UI

- 错误码：`docs/error-codes.md` 中的 `AI_CONTENT_*` 系列。  
- 前端消费：  
  - `useAiErrorUi` + error UI registry 将不同 code 映射为合适的 toast 行为（info/warning/error），细节见 `docs/error-logging.md`。  
  - Hook 本身仍返回结构化 error，供 UI 决定是否显示更丰富的错误信息（如错误面板）。

---

## 3. Chat 生命周期（execute-ai-chat-with-billing）

### 3.1 典型调用链

1. **前端调用**：
   - Chat UI 组件：`src/ai/chat/components/ChatBot.tsx`（以及相关 hooks）。  
   - 使用 `useChat` 或自定义 fetch 调用 `/api/chat`，并处理流式响应。

2. **API Route**：`src/app/api/chat/route.ts`
   - 步骤：
     - 使用 `resolveRequestId` + `createLoggerFromHeaders` 创建 logger（span: `api.ai.chat`）。  
     - 使用 `ensureApiUser` 鉴权；失败返回 `AUTH_UNAUTHORIZED` envelope 并记录 warn。  
     - 使用 `enforceRateLimit` 控制频率（scope: `chat`）。  
     - 解析 JSON body，失败返回 `AI_CHAT_INVALID_JSON`。  
     - 使用 `chatRequestSchema` 校验 body，失败返回 `AI_CHAT_INVALID_PARAMS`。  
     - 接受 `messages/model/webSearch` 后，记录 `Chat request accepted`。  
     - 使用 `withLogContext({ requestId, userId })` 调用 usecase `executeAiChatWithBilling`。  
     - 对成功结果使用 `toUIMessageStreamResponse` 将 streamText 结果转为 HTTP 流式响应。

3. **Usecase**：`src/lib/server/usecases/execute-ai-chat-with-billing.ts`
   - 入参：`{ userId, messages, model, webSearch, requiredCredits? }`。  
   - 步骤：
     1. 获取 AI 计费规则（`getAiChatBillingRule` → `DefaultAiBillingPolicy` → `websiteConfig.ai.billing.chat`），确定每次调用消耗的积分数量。  
     2. 基础参数校验（messages/model/webSearch），不合法时抛 `DomainError(AI_CHAT_INVALID_PARAMS)`。  
     3. 获取免费额度参数（freeCallsPerPeriod）：  
        - 如果 > 0，调用 `incrementAiUsageAndCheckWithinFreeQuota`（`src/ai/usage/ai-usage-service.ts`）对 `ai_usage` 表做原子自增，并检查是否仍在免费额度内。  
     4. 若在免费额度内：  
        - 仅记录 usage，不调用 `consumeCredits`。  
     5. 若超出免费额度：  
        - 调用 `consumeCredits({ userId, amount, description })` 扣减积分；  
        - 积分不足时会抛 `DomainError(CREDITS_INSUFFICIENT_BALANCE)`。  
     6. 构造并返回 `streamText` 结果（AI Provider 调用），真正的 HTTP 流式响应由调用方决定如何构造。

4. **AI Provider**：
   - 使用 `ai` SDK（如 `streamText`）调用底层模型（例如 OpenAI/OpenRouter 等），具体 provider 配置由上层模型参数决定。

### 3.2 错误与 UI

- 后端错误：
  - `DomainError` 在 route 层统一封装为 JSON envelope，非重试错误一般映射为 400，重试错误映射为 500。  
  - 未捕获错误使用 `UNEXPECTED_ERROR` 兜底。

- 前端错误：
  - Chat UI 通常在 stream 过程中处理错误事件，与 `useAiErrorUi` 或通用错误处理逻辑一起使用。  
  - `CREDITS_INSUFFICIENT_BALANCE` 等错误码可通过 `useCreditsErrorUi` 进行统一处理（如跳转 Credits 设置页）。

---

## 4. 图片生成生命周期（generate-image-with-credits）

### 4.1 典型调用链

1. **前端调用**：
   - 图片生成 UI 组件：`src/ai/image/components/*`（如 ImagePlayground）。  
   - Hook：`src/ai/image/hooks/use-image-generation.ts`  
     - 调用 `/api/generate-images`，处理响应 envelope，并使用 `useAiErrorUi` 映射错误到 toast 与 UI 状态。

2. **API Route**：`src/app/api/generate-images/route.ts`
   - 步骤：
     - 使用 `resolveRequestId` + `createLoggerFromHeaders`，span: `api.ai.image.generate`。  
     - 使用 `ensureApiUser` 鉴权；失败时记录 warn 并返回标准 401 envelope。  
     - 使用 `enforceRateLimit` 控制频率（scope: `generate-images`）。  
     - 解析 JSON body，失败返回 `AI_IMAGE_INVALID_JSON`。  
     - 使用 `generateImageRequestSchema` 校验 body，失败返回 `AI_IMAGE_INVALID_PARAMS`。  
     - 提取 `prompt/provider/modelId` 后，调用 usecase：  
       `generateImageWithCredits({ userId, request: { prompt, provider, modelId } })`，通过 `withLogContext` 传递上下文。

3. **Usecase**：`src/lib/server/usecases/generate-image-with-credits.ts`
   - 类似 Chat usecase：  
     - 读取图片生成计费规则（`getImageGenerateBillingRule` → `DefaultAiBillingPolicy` → `websiteConfig.ai.billing.generateImage`），决定每次调用消耗的积分数量与免费额度。  
     - 使用 `incrementAiUsageAndCheckWithinFreeQuota` 判断是否处于免费阶段。  
     - 若需扣费：调用 `consumeCredits` 扣积分；不足时抛 `CREDITS_INSUFFICIENT_BALANCE`。  
     - 调用图片生成 provider（OpenAI/Fireworks/Replicate/FAL），并把结果封装为 `GenerateImageResponse`：
       - 成功：`{ success: true, data }`；  
       - 失败：`{ success: false, error, code, retryable }`（如 `AI_IMAGE_PROVIDER_ERROR`, `AI_IMAGE_TIMEOUT`, `AI_IMAGE_INVALID_RESPONSE`）。

4. **错误映射**：
   - API Route 根据 `result.code` 设置适当的 HTTP status：  
     - `AI_IMAGE_INVALID_JSON` / `AI_IMAGE_INVALID_PARAMS` → 400  
     - `AI_IMAGE_TIMEOUT` → 504  
     - `AI_IMAGE_INVALID_RESPONSE` → 502  
     - 其他 provider error → 500

### 4.2 前端消费

- Hook `useImageGeneration`：
  - 通过 `useAiErrorUi` 将 `AI_IMAGE_*` 错误映射为合适的 toast（info/warning/error）与 UI 状态。  
  - 按需在组件内部显示 per-provider 错误详情或重试按钮。

---

## 5. 与 Credits / Payment / Storage 的边界

### 5.1 与 Credits 的关系

- 所有与积分相关的 AI 调用（Chat/Text/Image）都通过 usecase 层与 Credits 交互：
  - `executeAiChatWithBilling` / `analyze-web-content-with-credits` / `generate-image-with-credits`。  
  - Usecase 负责：
    - 调用 AI 使用量服务（`incrementAiUsageAndCheckWithinFreeQuota`）处理免费额度。  
    - 在超过免费额度时，通过 `consumeCredits` 扣积分。

- Credits 领域不感知 AI 提供方的细节，只关心：
  - 调用次数 / 周期统计；  
  - 积分扣费规则与余额。

### 5.2 与 Payment 的关系

- 当前 AI 调用不直接依赖 Payment 模块，但在业务层面有间接关系：
  - 某些订阅或积分套餐会发放 Credits（详见 `docs/credits-lifecycle.md` 与 `docs/payment-lifecycle.md`）。  
  - AI 调用通过 Credits 消耗额度，间接体现计费规则。

### 5.3 与 Storage 的关系

- 文本分析可能使用 Firecrawl 或内部抓取逻辑，部分实现会涉及临时存储或缓存，但与 `src/storage` 模块弱耦合。  
- 图片生成结果可以选择上传/持久化到存储系统（根据业务需要在 UI 或后端中显式调用 `uploadFile` / `uploadFileFromBrowser`）；AI usecases 本身不直接依赖 `src/storage`。

---

## 6. 扩展 AI 用例的建议

在新增 AI 相关功能时，建议遵循以下步骤：

1. 在 `src/ai/*` 下定义领域逻辑：
   - 文本/图片/其他 AI 能力的请求类型、响应结构、错误模型。  
   - 如需计费：在 `src/config/website.tsx` 中为新用例增加 `websiteConfig.ai.billing.*` 配置，并在 `src/ai/billing-policy.ts` / `src/ai/billing-config.ts` 中扩展对应规则与策略方法。
2. 在 usecase 层新增编排函数：
   - 放在 `src/lib/server/usecases/*` 中，负责 Credits/免费额度/调用 provider 的 orchestration。  
   - 避免在 API Route 中直接调用 provider。
3. 添加 API Route 或 Server Action：
   - 遵守统一 envelope 与日志上下文约定（参见 `docs/error-logging.md`）。  
   - 使用 `ensureApiUser` / `enforceRateLimit` 控制访问。
4. 在前端通过 Hook/组件消费：
   - 为复杂交互编写独立 Hook（参考 `useWebContentAnalyzer` / `useImageGeneration`）。  
   - 错误处理统一通过 `useAiErrorUi`，必要时与 `useCreditsErrorUi` 联合使用。

通过上述分层与边界约定，可以在不破坏现有 Credits/Billing/Storage 的前提下，持续扩展 AI 能力并保持错误模型与 UX 一致性。
