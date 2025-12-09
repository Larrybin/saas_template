# 错误码体系扩展计划（方案二：API 全量 + credits/billing 强类型约束）

## 目标与范围

- 目标：
  - 所有对外暴露在 HTTP 响应中的 `code` 字符串都来自集中定义的 `ErrorCodes`。
  - credits/billing 相关的 `DomainError.code` 与 API 错误码建立强类型绑定，减少魔法字符串和拼写错误。
  - 保持现有对外行为（字符串值、响应结构）完全兼容。
- 本轮范围：
  - A1：`src/app/api/**/*` 下所有路由的响应 `code` 字段统一改用 `ErrorCodes`。
  - B1：`src/domain/billing/**/*` 与 `src/credits/**/*` 中关键 `DomainError.code` 与 `ErrorCodes` 建立类型级约束。
  - 长期目标（C1）：逐步让全仓库所有对外可见错误码都通过 `ErrorCodes` 管理，本轮只覆盖 API + credits/billing。

## 执行步骤概览

### 步骤 1：梳理现有错误码与调用点

- 扫描并分类：
  - `src/app/api/**/*` 中所有 `code: 'SOME_CODE'`。
  - `src/domain/billing/**/*` 和 `src/credits/**/*` 中 `new DomainError({ code: '...' })`。
- 输出一个临时清单（仅在本地脑中/对话中，不必存文件），划分：
  - 已存在于 `ErrorCodes` 中的 code。
  - 仅在 API 层使用的 code（典型 HTTP 错误码字面量）。
  - 仅在 domain 层使用的 code（业务域错误码）。

### 步骤 2：补全 ErrorCodes registry

- 文件：`src/lib/server/error-codes.ts`
- 动作：
  - 将步骤 1 中尚未登记的 code 全部加入 `ErrorCodes` 常量对象中（字符串值保持不变）。
  - 按功能/模块简单分组排列（AI、credits、billing、auth、generic 等），但不做过度分层。
- 预期结果：
  - ErrorCodes 成为唯一的错误码来源，包含当前项目中所有 HTTP/API 相关的 code 字符串。

### 步骤 3：API 路由错误码全量迁移（A1）

- 范围：`src/app/api/**/*` 所有 route 文件。
- 动作：
  - 为每个 route：
    - 引入 `ErrorCodes`：`import { ErrorCodes } from '@/lib/server/error-codes';`
    - 将所有响应体中的 `code: 'SOME_CODE'` 改为 `code: ErrorCodes.SomeCode`。
  - 对于直接转发 domain/usecase 返回结果的路径：
    - 保持透传行为（例如 `code: error.code` 或 `code: result.code`），不强行包一层 ErrorCodes，确保不破坏已有语义。
- 预期结果：
  - 所有 API 响应里手写的 code 字符串全部消失，使用 ErrorCodes 常量。
  - 现有单测（尤其是 API route tests）期望的字符串值保持一致。

### 步骤 4：为 credits/billing DomainError 建立强类型约束（B1）

- 范围：
  - `src/domain/billing/**/*`（如 `billing-service.ts` 等）。
  - `src/credits/**/*` 中会向上冒泡到 API/客户端的 DomainError。
- 设计：
  - 在 `error-codes.ts` 或新文件中定义子类型：
    - `export type BillingErrorCode = typeof ErrorCodes.<subset>;`
    - `export type CreditsErrorCode = typeof ErrorCodes.<subset>;`
  - 在 DomainError 构造处收紧类型：
    - 对于 billing 域：`new DomainError({ code: ErrorCodes.BillingPlanNotFound as BillingErrorCode, ... })`
    - 对于 credits 域：类似方式使用 `CreditsErrorCode`。
  - 若 `DomainError` 类型本身支持泛型/约束，可评估是否在本轮做有限泛型化，否则通过显式类型别名过渡。
- 预期结果：
  - credits/billing 中任何新写入的错误码若不在对应 ErrorCodes 子集内，将在 TS 层面报错。
  - 现有测试不受影响，仅增强类型安全。

### 步骤 5：更新架构文档（视情况小幅调整）

- 文件：
  - `docs/architecture-overview.md` 或新增 `docs/error-codes.md`。
- 内容要点：
  - 说明 ErrorCodes 的角色：集中管理所有对外暴露错误码。
  - 简述 API route 和 DomainError 使用错误码的约定：
    - API 响应层：必须引用 ErrorCodes。
    - Domain 层（至少 credits/billing）：优先使用对应子类型，避免裸字符串。

### 步骤 6：验证

- 运行：
  - `pnpm lint`
  - `npx tsc --noEmit`
  - `pnpm test`
- 重点关注：
  - 所有 API route tests（尤其是断言 `json.code` 的用例）。
  - billing/credits 域的单元/集成测试。

## 约束与原则

- 对外兼容性：
  - 不改变任何已有 `code` 字段的字符串值。
  - 不改变 HTTP 状态码、响应结构以及路由路径/方法。
- 设计原则：
  - KISS：ErrorCodes 只承担“集中声明字符串 + 提供 TS 类型”的职责，不引入复杂错误层级体系。
  - YAGNI：暂不构建完整“错误域模型”（如 error domain + category），仅规范 code。
  - DRY：所有重复使用的错误码必须集中到 ErrorCodes。
  - SOLID：API route 仅依赖 ErrorCodes 常量；DomainError 类型只在需要处收紧 code 类型，避免全局泛型爆炸。

## 错误码变更 checklist

在新增或修改错误码时，建议逐项确认：

1. **集中声明**
   - [ ] 已在 `src/lib/server/error-codes.ts` 中新增或更新对应常量，字符串值符合现有命名规范。
2. **文档同步**
   - [ ] 已在 `docs/error-codes.md` 中补充或更新该错误码的说明（包括含义、所属领域、典型触发场景）。
3. **前端 UI 行为（如适用）**
   - [ ] 若该错误码需要特殊 UI 行为（跳转登录、打开积分页、特定 toast 文案等），已在 `src/lib/domain-error-ui-registry.ts` 中配置对应策略。
4. **领域 / 协议文档**
   - [ ] 若错误码属于特定领域（如 AI / Credits / Payment / Storage），已在对应的 `docs/*-lifecycle.md` 或相关文档中更新该错误码及其触发路径。
5. **协议报告 / 计划文档（如属跨领域协议变更）**
   - [ ] 若错误码牵涉跨领域协议或新增重要约定，已评估是否需要更新 `.codex/plan/protocol-future-techdebt-report.md` 及相关 `.codex/plan/*` 文档，保持报告与实现同步。
