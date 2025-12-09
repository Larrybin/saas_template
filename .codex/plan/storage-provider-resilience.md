---
title: Storage Provider 重试与预签名策略
---

## 背景
- `S3Provider` 仅做同步上传/删除调用，缺乏重试与指标，也未提供预签名 URL/HTTPS 强制策略，限制前端直传能力并增加中转压力。

## 参考最佳实践
- 《Amazon S3 User Guide》明确推荐使用预签名 URL 以安全地授予临时上传权限，并通过 HTTPS 保护传输（`/websites/aws_amazon_amazons3_userguide`）。

## 方案
1. **预签名上传**  
   - 在 `storage/provider` 中新增 `createPresignedUploadUrl({ key, contentType, expiresIn })`，底层使用 AWS SDK v3 `S3RequestPresigner`。  
   - API 路由新增 `POST /api/storage/presign`（鉴权 + folder 校验），返回 URL + headers。
2. **HTTPS 与 ACL**  
   - 强制 `publicUrl`/`endpoint` 使用 `https://`；检测非 HTTPS 时拒绝。  
   - 默认使用私有 ACL，仅通过 CDN/签名访问。
3. **重试与指标**  
   - 为 `uploadFile` / `deleteFile` 增加重试（指数退避，最多 3 次），并记录 `storage_upload_failures_total` 等指标；日志包含 `requestId`, `key`, `attempt`.
4. **文档同步**  
   - 更新 `docs/storage-lifecycle.md` 说明预签名流程、安全校验及指标。  
   - 在 `reports/storage-domain-review.md` 引用本计划。

## 当前状态（更新 2025-12-09）
- ✅ 预签名上传：`S3Provider` 新增 `createPresignedUploadUrl({ key, contentType, expiresInSeconds })`，内部使用 AWS SDK v3 `S3Client` + `getSignedUrl` 生成仅限指定 key 的预签名 PUT URL；新增 `POST /api/storage/presign` 路由（鉴权 + rate limit + `resolveTargetFolder` 校验），返回 `{ url, method: 'PUT', key }`，为后续浏览器直传能力铺路。  
- ✅ HTTPS 与 ACL：在 `S3Provider` 的配置校验中强制 `endpoint` 与 `publicUrl`（如配置）必须以 `https://` 开头，否则抛出 `ConfigurationError` 并拒绝初始化；当前仍使用 bucket 私有 ACL + 应用侧 URL 生成策略。  
- ✅ 重试与日志：`S3Provider.uploadFile` / `deleteFile` 通过内部 `withRetry(op, key, fn)` 对底层存储操作增加最多 3 次、指数退避重试，对 `ConfigurationError` 不重试，对持续失败的操作输出 `{ operation, key, attempt }` 级别的结构化日志；metrics 计数器暂未引入。  
- ✅ 文档同步：`docs/storage-lifecycle.md` 补充了“预签名上传（直传预备能力）”章节，描述 `/api/storage/presign` 行为与直传流程；本计划文件与 `reports/storage-domain-review.md` 互相引用，用于跟踪演进。
