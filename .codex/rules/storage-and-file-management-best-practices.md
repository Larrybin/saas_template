---
title: 存储与文件管理最佳实践
description: 基于 MkSaaS 模板的对象存储、上传校验与访问控制规范
---

## 适用范围

- 存储模块：`src/storage/*`
- 上传 API：`src/app/api/storage/upload/route.ts`
- 存储生命周期文档：`docs/storage-lifecycle.md`

## 设计目标

- 为所有文件存储提供统一接口，屏蔽 Provider（S3 / R2 等）差异。
- 在 API 层完成严格的安全校验（大小 / 类型 / 路径 / 用户隔离）。
- 为 UI 提供简单、一致的上传体验与错误反馈。

## 核心原则

1. **上传路径与权限隔离**
   - 所有上传必须指定逻辑 folder（如 `avatars`、`uploads/images`），并在服务端映射到安全路径。
   - 同一用户的文件路径应包含 userId，避免不同用户之间互相访问。

2. **服务端负责校验**
   - 文件大小、类型、folder 是否允许必须在 API route 校验，不能仅依赖前端。
   - 对非法请求返回统一 JSON envelope 与错误码（`STORAGE_*` 系列）。

3. **Provider 抽象与配置驱动**
   - `src/storage/index.ts` 提供 `uploadFile` / `deleteFile` / `getStorageProvider` 等统一接口。
   - 实际 Provider（如 S3）封装在 `src/storage/provider/*`，根据 `src/storage/config` 和 env 切换。

4. **错误体验与可观测性**
   - Upload API 返回结构化错误码，前端通过 `use-storage-error-ui` 统一将错误映射为友好提示。
   - 日志中记录文件名、大小、folder、userId 与错误码，便于审计与故障排查。

## 实践要点（结合本仓库）

1. 上传 API
   - `src/app/api/storage/upload/route.ts`：
     - 使用 `ensureApiUser` 进行认证；使用 `enforceRateLimit` 控制频率。
     - 校验 `Content-Type` 为 `multipart/form-data`，否则返回 `StorageInvalidContentType`。
     - 校验文件存在、大小不超过 10MB、MIME 类型在白名单内。
     - 使用 `resolveTargetFolder(folder, userId)` 规范路径，并强制包含 userId 后缀。
     - 使用 `uploadFile` 执行上传，并返回 `{ success: true, data }`。

2. 存储模块
   - `src/storage/README.md`：
     - 定义了模块职责、Provider 抽象与客户端上传流程。
   - `src/storage/client.ts`：
     - `uploadFileFromBrowser` 将浏览器文件统一发往 `/api/storage/upload`。

3. 生命周期文档
   - `docs/storage-lifecycle.md`：
     - 描述了上传 / 删除两个典型生命周期及其与 UI / API / Env 的边界。

## 反模式（应避免）

- 在 API 中直接将前端传入的 folder 拼接为路径，而不经过 `resolveTargetFolder`。
- 在前端直接上传到第三方存储，不走统一 API（除非设计上明确允许且有安全评估）。
- 在错误情况下返回非结构化响应（纯文本或无错误码 JSON）。

## Checklist

- [ ] 所有写入存储的路径均经过严格校验与标准化，并带有 userId。
- [ ] 上传 API 对大小 / 类型 / 频率都有清晰限制，并返回统一错误码。
- [ ] 前端统一使用 `uploadFileFromBrowser` 或类似 helper，并通过统一 Hook 显示错误。
- [ ] 存储 Provider 的配置与凭证完全由 env + config 管理，不在代码中硬编码。

## 实施进度 Checklist

- 已基本符合
  - [x] `/api/storage/upload` 已实现多层校验与认证、限流，并通过 `resolveTargetFolder` 控制路径。
  - [x] `src/storage/index.ts` 与 Provider 层已将对象存储操作抽象为统一接口。
  - [x] `src/storage/README.md` 与 `docs/storage-lifecycle.md` 对模块边界与生命周期有较完整说明。
- 尚待调整 / 确认
  - [ ] 是否所有需要持久化二进制数据的业务（如导出文件等）都统一复用 Storage 模块，而不是各自实现上传逻辑。
  - [ ] 存储清理策略（过期文件 / 垃圾文件）是否已有对应 Job 与文档说明。
  - [ ] 不同环境（本地 / 预发 / 生产）的存储 bucket / 路径约定是否在文档与配置中完全对齐。

