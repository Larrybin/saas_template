---
title: 领域分层与 Usecase 设计最佳实践
description: 基于 MkSaaS 模板的领域分层、Usecase 编排与模块边界规范
---

## 适用范围

- Usecase 层：`src/lib/server/usecases/*`
- 领域层：`src/domain/*`、`src/credits/*`、`src/payment/*`
- 文档：`docs/architecture-overview.md`、`docs/feature-modules.md`、`docs/credits-lifecycle.md`、`docs/payment-lifecycle.md`

## 设计目标

- 保持 API Route / UI 层薄而稳定，将业务复杂度集中在 Usecase 与 Domain。
- 为关键业务流程（AI + Billing + Credits 等）提供可测试、可复用的用例层。
- 在领域层清晰界定模块边界，避免“万能 service” 与层次混乱。

## 核心原则

1. **Route 薄、Usecase 厚、Domain 清晰**
   - Route / Action 只处理 HTTP/输入校验/鉴权/限流，将业务调用委托给 Usecase。
   - Usecase 负责跨领域编排（如 AI + Credits + Billing）。
   - Domain 专注于单领域规则（如 Billing 状态机、Credits 账本规则）。

2. **用例与领域解耦**
   - Usecase 通过接口（gateway）访问 Domain，而不是直接依赖具体存储实现。
   - Domain 不依赖 HTTP / UI 相关概念，仅依赖基础设施抽象（如 Repository）。

3. **显式上下文与日志**
   - Usecase 接口显式接受 `userId`、`requestId`、输入对象等必要上下文。
   - 在 Usecase 内部使用统一 logger 记录关键业务事件。

4. **错误模型统一**
   - Usecase 遇到业务错误时抛出 `DomainError`（含 code + retryable）。
   - Route 捕获 `DomainError` 后统一映射为 JSON envelope 与 HTTP 状态码。

## 实践要点（结合本仓库）

1. Usecase 示例
   - `execute-ai-chat-with-billing`：
     - 接收 `userId`、messages、model、webSearch 等参数。
     - 内部协调 Billing 规则、AI usage 计数与 Credits 扣减，然后调用 AI Provider。
   - `generate-image-with-credits`：
     - 先校验请求，再根据 Billing 规则与 free quota 决定是否扣减 Credits，然后调用 image Provider。
   - `analyze-web-content-with-credits`：
     - 使用 preflight 分离入口校验与后续分析流程，同样与 Credits / AI usage 联动。

2. 领域模块
   - Billing：`src/domain/billing/*` 定义订阅生命周期与与 Credits 的协作。
   - Plan：`src/domain/plan/*` 负责将 Stripe price / plan 映射为本地业务计划。
   - Credits：`src/credits/*` 将积分账本、分发、过期等行为封装为可复用服务。

3. 文档支持
   - `docs/architecture-overview.md`、`docs/feature-modules.md` 描述了整体分层与模块关系。
   - `docs/credits-lifecycle.md`、`docs/payment-lifecycle.md` 以「事件 → 调用链 → 持久化影响」的方式说明完整用例。

## 反模式（应避免）

- 在 API Route 中直接实现复杂业务流程，而不经 Usecase。
- Domain 层持有 HTTP 细节或直接读写 env / config。
- 为“方便”在 Usecase 中绕过 Domain 直接操作数据库。

## Checklist

- [ ] 所有跨领域的业务流程（如 AI + Credits + Billing）都有独立 Usecase 文件。
- [ ] Route / Action 中不包含复杂的 if/else 业务流程，而是快速委托给 Usecase。
- [ ] Domain 模��不依赖 HTTP / UI / Next.js 相关概念。
- [ ] Usecase 的错误模型统一使用 `DomainError` 并在 Route 层转换为 envelope。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/lib/server/usecases/*` 已为 AI + Credits / Credits 分发等核心流程提供了独立用例层。
  - [x] Billing、Plan、Credits 等领域模块已拆分至 `src/domain/*` 与 `src/credits/*`，并通过 Usecase 构建高层行为。
  - [x] `docs/architecture-overview.md` 与 `docs/feature-modules.md` 较详细描述了分层策略与调用关系。
- 尚待调整 / 确认
  - [ ] 新增业务功能时是否始终遵循“Route 薄、Usecase 厚”的模式，而不是直接在 Route 中实现业务。
  - [ ] 部分领域服务是否还有与 env / config 过度耦合的情况，需要通过配置层或 gateway 抽象出来。
  - [ ] Usecase 的错误码与 DomainError 使用是否完全与 `.codex/rules/api-protocol-and-error-codes-best-practices.md` 对齐。

