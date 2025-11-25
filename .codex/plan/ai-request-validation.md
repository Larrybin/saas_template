## 任务：AI 相关 API 请求体验证补齐（/api/chat, /api/generate-images, /api/analyze-content）

### 1. 背景

- 端点：
  - `src/app/api/chat/route.ts`
  - `src/app/api/generate-images/route.ts`
  - `src/app/api/analyze-content/route.ts`
- 问题：
  - `/api/chat` 直接 `await req.json()` 解构，缺少运行时 schema 校验。
  - `/api/generate-images` 虽有 JSON parse 错误处理（`AI_IMAGE_INVALID_JSON`），但仍通过类型断言 `body as GenerateImageRequest`，字段级验证分散在 use case 内。
  - `/api/analyze-content` 已有 JSON 校验和 DomainError 封装，但未显式使用现有 zod schema（`validateAnalyzeContentRequest`）在路由层做参数验证。
  - 这些端点均处于 AI + 计费/免费额度域，输入质量直接影响计费和错误可观测性。

### 2. 目标

- 在 **AI 子域内部** 建立统一的请求体验证入口：
  - 使用 zod 作为运行时 schema。
  - 对无效参数尽早在 Route 层返回 4xx + 明确的 `AI_*_INVALID_PARAMS` / `AI_*_VALIDATION_ERROR`。
  - 保持 use case 内的防御性校验作为兜底，不破坏现有业务语义。
- 范围限定：
  - 本轮仅覆盖 `/api/chat`、`/api/generate-images` 和 `/api/analyze-content`。
  - 不在全项目层面引入“全局 HTTP schema 层”，保持 KISS / YAGNI。

### 3. 实施方案摘要

#### 3.1 /api/chat

- 新增 `src/ai/chat/lib/api-schema.ts`：
  - `chatRequestSchema = z.object({ messages: z.array(z.any()).min(1), model: z.string().min(1), webSearch: z.boolean().optional().default(false) })`
  - `ChatRequest = z.infer<typeof chatRequestSchema>`
- 调整 `src/app/api/chat/route.ts`：
  - 使用 `chatRequestSchema.safeParse(await req.json())`。
  - 校验失败：
    - 记录 issues（path/code/message）到日志。
    - 返回 400：
      - `{ success: false, error: 'Invalid chat request parameters', code: 'AI_CHAT_INVALID_PARAMS', retryable: false }`
  - 校验成功：
    - 解构 `messages/model/webSearch` 传入 `executeAiChatWithBilling`。
- 保留 use case 中的基础校验与 `DomainError('AI_CHAT_INVALID_PARAMS')` 作为第二道防线。

#### 3.2 /api/generate-images

- 扩展 `src/ai/image/lib/api-types.ts`：
  - 引入 zod，新增：
    - `generateImageRequestSchema = z.object({ prompt: z.string().min(1), provider: z.enum(['replicate','openai','fireworks','fal']), modelId: z.string().min(1) })`
    - `GenerateImageRequestInput = z.infer<typeof generateImageRequestSchema>`
- 调整 `src/app/api/generate-images/route.ts`：
  - 保留 JSON parse try/catch → `AI_IMAGE_INVALID_JSON`。
  - 在解析后，使用 `generateImageRequestSchema.safeParse(body)`：
    - 校验失败：
      - 记录 issues。
      - 返回 400 + `{ success: false, error: 'Invalid image generation parameters.', code: 'AI_IMAGE_INVALID_PARAMS', retryable: false }`。
    - 校验成功：
      - 解构 `prompt/provider/modelId` 传入 `generateImageWithCredits`。
- 保留 use case 内的参数校验和 credits/fallback 逻辑。

#### 3.3 /api/analyze-content

- 复用现有 `src/ai/text/utils/web-content-analyzer.ts` 中的：
  - `analyzeContentRequestSchema` / `validateAnalyzeContentRequest`。
- 调整 `src/app/api/analyze-content/route.ts`：
  - 保留 JSON parse try/catch → `WebContentAnalyzerError`（`ErrorType.VALIDATION` + “Invalid JSON body”）。
  - 在成功解析 JSON 后，调用 `validateAnalyzeContentRequest(body)`：
    - 校验失败：
      - 构造 `WebContentAnalyzerError(ErrorType.VALIDATION, ...)`，code 为 `AI_CONTENT_VALIDATION_ERROR`（由 error-handling 内映射保证）。
      - 通过 `logAnalyzerErrorServer` 和 `logger.warn` 记录 issues。
      - 返回 400 + `{ success: false, error: validationError.userMessage, code: validationError.code, retryable: validationError.retryable }`。
    - 校验成功：
      - 将 `parsedBody.data` 作为 use case 的 `body` 传入 `analyzeWebContentWithCredits`。

### 4. 验证与回归

- 本轮重点考虑：
  - 无效请求不会进入计费/AI 调用路径。
  - 错误 code 一致且可观测：
    - `/api/chat`：`AI_CHAT_INVALID_PARAMS`。
    - `/api/generate-images`：`AI_IMAGE_INVALID_JSON` / `AI_IMAGE_INVALID_PARAMS`。
    - `/api/analyze-content`：`AI_CONTENT_VALIDATION_ERROR`（源自 `WebContentAnalyzerError` 的 code 映射）。
- 已运行：
  - `pnpm test`（全量 Vitest），确保现有测试（尤其是 AI / credits / billing / analyze-content 相关用例）全部通过。

