# Storage client DomainError 保留计划

## 背景
`uploadFileFromBrowser` 在 `try/catch` 中统一包装错误，导致前面构造的 `DomainErrorLike` 被覆盖，调用方无法读取 `code`/`retryable`。

## 方案
1. 在 `catch (error)` 内先判断 `error instanceof Error`，已知错误直接重抛。
2. 仅当捕获到非 Error 值时，构造新的 `Error('Unknown...')` 并抛出。

## 预期
- 保留 DomainError 属性，外部 UI 策略正常。
- 对未知值仍有清晰消息。