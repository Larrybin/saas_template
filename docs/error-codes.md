# 错误码表（Error Codes）

本项目对外暴露的错误码通过 `src/lib/server/error-codes.ts` 统一管理。  
下表按领域列出当前已注册的错误码（字符串值保持与既有实现完全一致）。

> 说明：  
> - **Code**：对外返回的 `code` 字段字符串。  
> - **Key**：在 `ErrorCodes` 中的常量名称。  
> - **Domain**：所属领域/子系统。  
> - **Description**：用途简要说明。

## 通用 / Generic

| Code                | Key               | Domain   | Description                    |
| ------------------- | ----------------- | -------- | ------------------------------ |
| `UNEXPECTED_ERROR`  | `UnexpectedError` | Generic  | 未分类的服务器端未知错误兜底。 |

## Auth / 身份认证

| Code               | Key              | Domain | Description                     |
| ------------------ | ---------------- | ------ | ------------------------------- |
| `AUTH_ERROR`       | `AuthError`      | Auth   | 通用认证错误（默认值）。       |
| `AUTH_UNAUTHORIZED`| `AuthUnauthorized`| Auth  | 未登录或凭证无效。             |
| `AUTH_BANNED`      | `AuthBanned`     | Auth   | 账号被封禁。                   |

## Billing / 计费

| Code                    | Key                   | Domain  | Description                                     |
| ----------------------- | --------------------- | ------- | ----------------------------------------------- |
| `BILLING_PLAN_NOT_FOUND`| `BillingPlanNotFound` | Billing | 计费计划不存在或已禁用。                       |
| `BILLING_PRICE_NOT_FOUND`| `BillingPriceNotFound`| Billing | 计费计划下找不到对应价格。                    |
| `PAYMENT_SECURITY_VIOLATION` | `PaymentSecurityViolation` | Billing / Payment | 支付安全校验失败（如签名/密钥错误）。        |
| `CREEM_WEBHOOK_MISCONFIGURED` | `CreemWebhookMisconfigured` | Billing / Payment | Creem Webhook 环境变量未正确配置（如 `CREEM_WEBHOOK_SECRET` 缺失）。 |
| `CREEM_PROVIDER_MISCONFIGURED` | `CreemProviderMisconfigured` | Billing / Payment | Creem Provider 配置错误（env 或 plan/package 映射缺失、API key 无效等）。 |
| `CREEM_CHECKOUT_INVALID_REQUEST` | `CreemCheckoutInvalidRequest` | Billing / Payment | 向 Creem 发起的 checkout 请求参数不合法（4xx 请求错误）。 |
| `CREEM_CHECKOUT_DOWNSTREAM_ERROR` | `CreemCheckoutDownstreamError` | Billing / Payment | Creem 下游服务异常（5xx 或未细分的下游错误）。 |
| `CREEM_CHECKOUT_NETWORK_ERROR` | `CreemCheckoutNetworkError` | Billing / Payment | 调用 Creem checkout API 时的网络或传输层错误。 |
| `SUBSCRIPTION_FETCH_FAILED` | `SubscriptionFetchFailed` | Billing / Payment | 查询订阅状态失败（Stripe 调用或配置异常）。 |

## Credits / 积分

| Code                          | Key                       | Domain  | Description                                |
| ----------------------------- | ------------------------- | ------- | ------------------------------------------ |
| `CREDITS_INVALID_PAYLOAD`     | `CreditsInvalidPayload`   | Credits | 请求载荷不合法（积分相关）。              |
| `CREDITS_INSUFFICIENT_BALANCE`| `CreditsInsufficientBalance` | Credits | 积分余额不足。                           |
| `CREDITS_PLAN_POLICY_MISSING` | `CreditsPlanPolicyMissing`| Credits | 对应 plan/price 缺少积分策略配置。       |
| `CREDITS_DISTRIBUTION_FAILED` | `CreditsDistributionFailed`| Credits | 积分分发 Job 执行失败。                  |

## Ops / Cron

| Code                           | Key                        | Domain | Description                                      |
| ------------------------------ | -------------------------- | ------ | ------------------------------------------------ |
| `CRON_BASIC_AUTH_MISCONFIGURED`| `CronBasicAuthMisconfigured`| Ops   | Cron Basic Auth 环境变量未正确配置（缺失/不完整）。 |

## AI Chat / 文本对话

| Code                    | Key                 | Domain | Description                        |
| ----------------------- | ------------------- | ------ | ---------------------------------- |
| `AI_CHAT_INVALID_JSON`  | `AiChatInvalidJson` | AI     | Chat API 请求体不是合法 JSON。    |
| `AI_CHAT_INVALID_PARAMS`| `AiChatInvalidParams`| AI    | Chat API 参数校验失败。           |

## AI Image / 图片生成

| Code                      | Key                       | Domain | Description                             |
| ------------------------- | ------------------------- | ------ | --------------------------------------- |
| `AI_IMAGE_INVALID_JSON`   | `ImageGenerateInvalidJson`| AI     | 图片生成请求体不是合法 JSON。          |
| `AI_IMAGE_INVALID_PARAMS` | `ImageGenerateInvalidParams`| AI   | 图片生成请求参数校验失败。             |
| `AI_IMAGE_PROVIDER_ERROR` | `ImageProviderError`      | AI     | 调用图片生成提供商失败（通用错误）。   |
| `AI_IMAGE_INVALID_RESPONSE` | `ImageInvalidResponse`   | AI     | 提供商返回数据不合法。                 |
| `AI_IMAGE_TIMEOUT`        | `ImageTimeout`            | AI     | 调用图片生成超时。                      |

## AI Web Content / 网页内容分析

对应 `WebContentAnalyzerError` 使用的错误码：

| Code                             | Key                        | Domain | Description                                |
| -------------------------------- | -------------------------- | ------ | ------------------------------------------ |
| `AI_CONTENT_VALIDATION_ERROR`    | `AiContentValidationError` | AI     | URL/请求参数校验失败。                    |
| `AI_CONTENT_NETWORK_ERROR`       | `AiContentNetworkError`    | AI     | 网络异常（连接/解析失败等）。            |
| `AI_CONTENT_TIMEOUT`             | `AiContentTimeout`         | AI     | 请求超时。                                |
| `AI_CONTENT_RATE_LIMIT`          | `AiContentRateLimit`       | AI     | 触发速率限制。                            |
| `AI_CONTENT_AUTH_ERROR`          | `AiContentAuthError`       | AI     | 授权/认证失败。                           |
| `AI_CONTENT_SERVICE_UNAVAILABLE` | `AiContentServiceUnavailable`| AI   | 下游服务暂不可用。                        |
| `AI_CONTENT_ANALYSIS_ERROR`      | `AiContentAnalysisError`   | AI     | 分析过程内部错误。                        |
| `AI_CONTENT_SCRAPING_ERROR`      | `AiContentScrapingError`   | AI     | 抓取网页内容失败。                        |
| `AI_CONTENT_UNKNOWN_ERROR`       | `AiContentUnknownError`    | AI     | 未分类的内容分析错误。                    |
| `ANALYZE_CONTENT_INVALID_JSON`   | `AnalyzeContentInvalidJson`| AI     | `/api/analyze-content` 请求体不是合法 JSON。|
| `ANALYZE_CONTENT_INVALID_PARAMS` | `AnalyzeContentInvalidParams`| AI   | `/api/analyze-content` 参数校验失败。     |

## Storage / 存储

| Code                        | Key                     | Domain  | Description                                   |
| --------------------------- | ----------------------- | ------- | --------------------------------------------- |
| `STORAGE_INVALID_CONTENT_TYPE` | `StorageInvalidContentType` | Storage | Content-Type 非 multipart/form-data。       |
| `STORAGE_NO_FILE`           | `StorageNoFile`         | Storage | 未提供文件。                                 |
| `STORAGE_FILE_TOO_LARGE`    | `StorageFileTooLarge`   | Storage | 文件超出大小限制（当前 10MB）。             |
| `STORAGE_UNSUPPORTED_TYPE`  | `StorageUnsupportedType`| Storage | 不支持的 MIME 类型。                         |
| `STORAGE_INVALID_FOLDER`    | `StorageInvalidFolder`  | Storage | 目标文件夹不合法或不在允许列表中。         |
| `STORAGE_PROVIDER_ERROR`    | `StorageProviderError`  | Storage | 存储提供商内部错误（如 S3/兼容实现异常）。 |
| `STORAGE_UNKNOWN_ERROR`     | `StorageUnknownError`   | Storage | 未分类的存储错误兜底。                       |

## Docs Search / 文档搜索

| Code                 | Key                | Domain | Description                          |
| -------------------- | ------------------ | ------ | ------------------------------------ |
| `DOCS_SEARCH_FAILED` | `DocsSearchFailed` | Docs   | 文档搜索失败，参考日志获取更多详情。 |

## Newsletter / 通知订阅

| Code                         | Key                      | Domain      | Description                                   |
| ---------------------------- | ------------------------ | ----------- | --------------------------------------------- |
| `NEWSLETTER_SUBSCRIBE_FAILED`   | `NewsletterSubscribeFailed`   | Newsletter | 订阅 Newsletter 失败（包含欢迎邮件发送失败）。 |
| `NEWSLETTER_UNSUBSCRIBE_FAILED` | `NewsletterUnsubscribeFailed` | Newsletter | 退订 Newsletter 失败。                         |
| `NEWSLETTER_STATUS_FAILED`      | `NewsletterStatusFailed`      | Newsletter | 查询 Newsletter 订阅状态失败。                 |

## Contact & Captcha / 联系与验证码

| Code                     | Key                 | Domain   | Description                                 |
| ------------------------ | ------------------- | -------- | ------------------------------------------- |
| `CONTACT_SEND_FAILED`    | `ContactSendFailed` | Contact  | 联系表单邮件发送失败。                       |
| `CAPTCHA_VALIDATION_FAILED` | `CaptchaValidationFailed` | Auth / Captcha | 验证 Turnstile Captcha 失败（服务端调用错误）。 |

## 使用约定

- 所有对外 HTTP API 的响应 `code` 字段必须来自 `ErrorCodes` 常量，不允许直接写字符串字面量。  
- 领域层（如 billing、credits、auth、web content）定义的 `DomainError` 子类应使用对应的 `*ErrorCode` 类型别名，保证在编译期约束可用错误码集合。  
- 前端使用 `getDomainErrorMessage(code, t, fallback)` 时，`code` 也应是上述表中已定义的字符串，以获得正确的本地化文案。  
- 若需要新增错误码，建议优先：  
  1. 在 `ErrorCodes` 中增加常量；  
  2. 在此文档中补充对应行；  
  3. 如有需要，在 `DOMAIN_ERROR_MESSAGES` 中补充 i18n key 映射。
