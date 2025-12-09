# 存储域审查报告（静态审查）

## 基线
- `/websites/aws_amazon_amazons3_userguide`：安全传输、SSE-KMS、策略限制。

## 评分矩阵（1–5）
- 正确性与鲁棒性 3（无重试/幂等）
- 可读性 4（结构清晰）
- 一致性 3.5（错误包装一致，安全策略缺失）
- 复杂度 3（逻辑简单）
- 性能 3（无分片/流式）
- 安全性 2.5（无 contentType/size 白名单，未用预签名）
- 可测试性 3（易 mock，缺失败用例）
- 扩展性 3（单一 provider）
- 依赖与边界 3（直接依赖 config，未注入）
- 日志与可观测性 3（有日志，无指标/告警）
- 测试覆盖 3（缺安全/失败场景）

## 发现表（复核 2025-12-09）
- 中 | src/storage/provider/s3.ts 全域 | 仍缺预签名 URL + HTTPS 强制策略，上传完全依赖服务器转发；对于需要客户端直传的场景无签名限制 | 安全性 | 基线：安全传输/签名
- 中 | src/storage/provider/s3.ts:96-173 | 上传/删除失败依旧没有重试/指标，上游无法得知失败率，排障困难 | 鲁棒性/可观测性 | 基线：可观测性
- 低 | src/storage/index.ts:32-42 | 仍为单一 provider，切换或多租户场景需要改代码 | 扩展性 | 基线：可插拔

### 状态更新（已解决）
- ✅ `POST /api/storage/upload` 现已在入口处校验 `Content-Type`、文件大小、MIME 魔术数与安全文件夹（`src/app/api/storage/upload/route.ts:117-209`），此前“未校验 contentType/大小”的风险已消除。

## 测试缺口表
- 配置缺失：region/endpoint/cred/bucket fail-fast。
- 上传失败/重试：网络异常、非 2xx。
- 安全：非法 contentType/超限大小、路径穿越。
- 删除不存在对象：记录警告与指标。

## 建议表（更新后）
- 高 | 为前端提供预签名上传（限制 HTTP method / Content-Type / 过期时间），并强制 CDN/HTTPS，避免服务端中转成为瓶颈 | 依据：s3.ts + 入口路由
- 中 | 在 `S3Provider` 中引入重试策略（指数退避）与 metrics/告警；失败时返回 requestId/objectKey 供排障 | 依据：s3.ts:96-173
- 中 | 抽象 StorageProviderFactory + 配置 schema，方便按环境切换 S3/R2，本地最小化代码改动 | 依据：storage/index.ts:32-42
- 低 | 可选启用 SSE-KMS/前缀规范，便于数据分区与清理 | 依据：s3.ts

## 简短摘要
主要风险是上传安全与幂等/可观测性不足；需白名单+预签名+重试/指标，并引入可插拔工厂与配置校验。***
