# Storage 模块生命周期与边界说明

> 本文聚焦 Storage 模块在「上传 / 删除」两个典型生命周期中的行为，以及与 UI / API / Env / 外部存储提供方之间的边界关系。  
> 架构与模块总览请参考：`docs/architecture-overview.md`、`docs/feature-modules.md`。

---

## 1. 模块职责与分层

Storage 模块的主要职责：

- 提供统一的对象存储接口（上传 / 删除），屏蔽具体云厂商差异。  
- 在边界层（API Route / client helper）完成安全校验（大小、类型、路径）与错误模型封装。  
- 通过 env + config 灵活切换存储实现（当前默认 S3 / R2 via s3mini）。

分层结构：

- UI / 客户端：
  - 组件与页面：例如 `UpdateAvatarCard`。  
  - 客户端 helper：`src/storage/client.ts`（`uploadFileFromBrowser`）。
- API / Server：
  - 上传入口：`src/app/api/storage/upload/route.ts`。  
  - 通用存储 API：`src/storage/index.ts`（`uploadFile` / `deleteFile` / `getStorageProvider`）。
- Provider 实现：
  - S3 provider：`src/storage/provider/s3.ts`（基于 s3mini）。  
  - 类型定义：`src/storage/types.ts`。  
  - 配置适配：`src/storage/config/storage-config.ts`（从 `serverEnv.storage` 构造 `StorageConfig`）。

---

## 2. 上传生命周期（Upload）

### 2.1 客户端上传（浏览器 → API）

1. **组件层：选择文件并调用 helper**
   - 典型组件：`src/components/settings/profile/update-avatar-card.tsx`  
     - 创建 `<input type="file">` 让用户选图。  
     - 选取文件后：
       - 先通过 `URL.createObjectURL(file)` 显示本地预览。  
       - 再调用 `uploadFileFromBrowser(file, 'avatars')` 推送到后端。

2. **客户端 helper：`uploadFileFromBrowser`（`src/storage/client.ts`）**
   - 行为：
     - 构造 `FormData`（`file` + `folder`）；  
     - `fetch('/api/storage/upload', { method: 'POST', body: formData })`；  
     - 解析 JSON，预期形状：
       - 成功：`{ success: true, data: UploadFileResult }`；  
       - 失败：`{ success: false, error?: string, code?: string, retryable?: boolean }`。
     - 当 `!response.ok` 或 `!json.success` 时：
       - 使用 `getErrorUiStrategy(json.code)` 查找 Storage 相关错误策略；  
       - 使用 `getDomainErrorMessage(json.code, undefined, strategy.defaultFallbackMessage ?? 'Failed to upload file')` 生成 message；  
       - 抛出 `Error & DomainErrorLike`，附带 `code/retryable`，供上层 Hook/组件通过 `useStorageErrorUi` 统一消费。

3. **前端错误 UI：`useStorageErrorUi`（`src/hooks/use-storage-error-ui.ts`）**
   - 领域 Hook 封装：
     - 根据 `error.code` 查找 registry 策略（如 `STORAGE_FILE_TOO_LARGE`、`STORAGE_UNSUPPORTED_TYPE` 等）。  
     - 使用 `getDomainErrorMessage` + fallback 生成最终 message。  
     - 统一 `toast.error(message)`，并返回 message 供组件写入本地 state（如错误提示区域）。

### 2.2 API Route：`/api/storage/upload`

1. **鉴权与限流**
   - 路由文件：`src/app/api/storage/upload/route.ts`。  
   - 步骤：
     - 使用 `createLoggerFromHeaders` 创建 logger（`span: 'api.storage.upload'`）。  
     - `ensureApiUser` 校验登录状态，未登录返回 401 + `AUTH_UNAUTHORIZED` envelope。  
     - 使用 `enforceRateLimit` 控制上传频率（scope: `storage-upload`）。

2. **请求校验**
   - Content-Type：
     - 检查 `content-type` 是否以 `multipart/form-data` 开头，否则返回 400 + `STORAGE_INVALID_CONTENT_TYPE`。  
   - FormData：
     - 从 `request.formData()` 解析 `file` + `folder`。  
     - 文件缺失 → 400 + `STORAGE_NO_FILE`。  
     - 文件大小超限（默认 10MB） → 400 + `STORAGE_FILE_TOO_LARGE`。  
     - MIME 类型不在允许列表（如 `image/jpeg|png|webp`） → 400 + `STORAGE_UNSUPPORTED_TYPE`。
   - 目标 folder：
     - 使用 `resolveTargetFolder(folder, userId)` 做路径校验：  
       - 仅允许 `websiteConfig.storage.allowedFolders` 中的根目录；  
       - 使用正则 `SAFE_FOLDER_REGEX` 约束子路径；  
       - 自动附加 `userId` 作为后缀，避免不同用户共享同一目录。  
     - 校验失败 → 400 + `STORAGE_INVALID_FOLDER`。

3. **上传与响应**
   - 将 `file` 转为 `Buffer`；  
   - 调用 `uploadFile(buffer, file.name, file.type, resolvedFolder.folder)`：  
     - 由 `src/storage/index.ts` 决定使用当前 provider（默认 `S3Provider`）。  
   - 成功：
     - 记录结构化日志（文件名/大小/folder/userId）。  
     - 返回 200 + `{ success: true, data: UploadFileResult }`。  
   - 失败：
     - 若为 `StorageError` → 500 + `{ success: false, error, code: STORAGE_PROVIDER_ERROR, retryable: true }`；  
     - 其他错误 → 500 + `{ success: false, error: 'Something went wrong while uploading the file', code: STORAGE_UNKNOWN_ERROR, retryable: true }`。

---

## 3. 删除生命周期（Delete）

1. **业务触发**
   - 删除通常由后台逻辑或管理工具触发（例如用户更换头像、管理员清理资源），不强制提供专用 API Route。  
   - 建议通过服务/脚本调用 `deleteFile(key)`，而非在 UI 直接操作 provider。

2. **调用链**
   - `deleteFile(key)`（`src/storage/index.ts`）：
     - 获取 provider（`getStorageProvider`），并调用其 `deleteFile` 实现。  
   - `S3Provider.deleteFile(key)`：
     - 调用 s3mini 的 `deleteObject(key)`。  
     - 若返回 false，记录 `warn` 日志（文件不存在或无法删除）；  
     - 发生异常时：
       - 记录 `error` 日志。  
       - 抛出 `StorageError(message)`，供上层决定是否进一步处理（例如在管理脚本中重试/告警）。

3. **前端交互**
   - 通常不在前端直接删除对象，而是通过业务层（例如更新用户资料时用新 avatar URL 覆盖旧值），存储清理交给后台任务处理。  
   - 若确有“用户手动删除文件”的界面，可以按上传的模式设计一个受保护的 API Route，再调用 `deleteFile`。

---

## 4. Provider 与 Env 边界

### 4.1 Provider 选择与初始化

- Provider 入口：`src/storage/index.ts`
  - `initializeStorageProvider` 根据 `websiteConfig.storage.provider` 选择 provider（当前支持 `'s3'`）。  
  - 不支持的 provider 类型会抛出错误，避免静默失败。

- S3 Provider：`src/storage/provider/s3.ts`
  - 使用 `StorageConfig`（来自 `src/storage/config/storage-config.ts`）进行初始化。  
  - `getS3Client` 中严格校验：
    - `region`、`accessKeyId`、`secretAccessKey`、`endpoint`、`bucketName` 是否配置。  
    - 若缺失，抛出 `ConfigurationError`，并记录详细日志。  
  - URL 规则：
    - 若配置 `publicUrl`：URL = `publicUrl/key`。  
    - 否则：使用 `endpoint + bucket` 构造 URL。

### 4.2 环境变量约定

- `src/env/server.ts` 中的 `storage` 字段对应以下 env：
  - `STORAGE_REGION`  
  - `STORAGE_ENDPOINT`  
  - `STORAGE_ACCESS_KEY_ID`  
  - `STORAGE_SECRET_ACCESS_KEY`  
  - `STORAGE_BUCKET_NAME`  
  - `STORAGE_PUBLIC_URL`  
  - `STORAGE_FORCE_PATH_STYLE`

更多运维细节（包括 env 配置、日志与监控建议）参见 `docs/env-and-ops.md` 与 `src/storage/README.md`。

---

## 5. 边界与扩展点

### 5.1 与 UI / Actions / API 的边界

- UI 与 Storage 的交互主要通过：
  - `uploadFileFromBrowser` + `useStorageErrorUi`（客户端上传 + 错误 UI）；  
  - 特定 API Route（如 `/api/storage/upload`）完成安全校验与调用存储服务。

- UI 不直接使用存储 provider 或 env，所有与存储相关的配置与实现细节都通过：
  - `websiteConfig.storage`（开关 / provider 类型 / allowedFolders）；  
  - `StorageConfig` + provider 实现封装。

### 5.2 与其他领域的边界

- Auth / Credits / Payment / AI 模块均可以视需要使用 Storage，但建议依赖 `uploadFile` / `deleteFile` 等抽象 API，而不是直接调用 provider 或 s3mini。  
- 日志字段中的 `span: 'storage.*'` / `route: '/api/storage/upload'` 等有助于从日志平台快速筛选存储相关问题。

### 5.3 扩展新的 Storage Provider

当需要支持新的存储提供方时，推荐步骤：

1. 实现新的 `StorageProvider`：
   - 在 `src/storage/provider/*` 中实现 `StorageProvider` 接口（`uploadFile` / `deleteFile` / `getProviderName`）。  
   - 在实现内部处理 provider 特有的认证、路径与 URL 规则，并使用 `StorageError` / `UploadError` / `ConfigurationError` 封装错误。
2. 在入口处接入：
   - 在 `initializeStorageProvider` 中根据新的 `websiteConfig.storage.provider` 值分支初始化 provider。  
   - 如有需要，扩展 `StorageConfig` 与 `storage-config.ts` 以支持 provider 特定配置。
3. 如有新 API Route 或前端场景：
   - 复用 `/api/storage/upload` 的 envelope 与错误模型约定。  
   - 在前端继续使用 `uploadFileFromBrowser` 和 `useStorageErrorUi`，避免新增 provider 时修改大量 UI 代码。

通过上述分层与边界控制，可以在不影响现有业务的前提下，安全地替换或增加存储后端。

