# 仓库代码审核：协议 / 未来演进 / 技术债

## 背景与目标

- 目标：对当前仓库进行一次「全栈、分模块」代码审核，从以下三个视角输出结构化问题清单：
  - 协议（API / Domain 协议一致性、错误 envelope、错误码体系等）；
  - 未来演进（架构扩展性、新功能/新 AI 能力/新计费规则接入成本）；
  - 技术债（耦合、重复逻辑、隐性复杂度、缺失测试、文档与实现偏差等）。
- 输出形态：分模块问题清单 + 优先级（P0-P2）+ 建议整改策略，并附一节跨模块系统性问题总结。

## 审查路径（分层）

按照架构文档的依赖方向，自上而下进行：

1. `src/app/**`：App Router 页面与 API Route Handlers。
2. `src/lib/**`：通用服务与 server-side 基础设施（错误、日志、限流、auth、usecases 等）。
3. `src/domain/**` / `src/credits/**` / `src/payment/**` / `src/db/**`：领域层与数据访问。
4. `src/mail/**` / `src/newsletter/**` / `src/notification/**`：对外沟通域（邮件、通知等）。
5. `messages/**` / `content/**` / `public/**`：文案、内容与静态资源。
6. `tests/**` / `scripts/**`：关键协议路径的测试覆盖与辅助脚本。

## 分模块审核要点

### 1. `src/app/**`

- 枚举所有 `route.ts` / API Handler，记录：
  - 成功响应结构（是否统一使用 envelope，如 `{ success, data }`）；
  - 失败响应结构（是否包含 `code`，是否来自统一的 `ErrorCodes`，是否有魔法字符串）；
  - 流式/边缘 Route 的错误处理是否与普通 Route 对齐；
  - 同一领域下多条路由之间的协议风格是否一致。
- 页级组件：
  - 前端如何消费错误响应（基于 HTTP status vs. 基于 `code` vs. 自定义字段）；
  - UI 假设的错误结构与后端实际协议是否存在偏差风险。

### 2. `src/lib/**`

- `src/lib/server/error-codes.ts`：
  - 错误码集中度（是否所有对外 `code` 都集中在此处定义）；
  - 类型别名/DomainError 对错误码集合的编译期约束程度；
  - 与 `docs/error-codes.md` 的差异（未文档化/已废弃/命名不一致）。
- `src/lib/server/usecases/**`：
  - AI Chat with Billing & Credits、Credits Job 等 usecase：
    - 是否在 usecase 层形成明确的成功/失败协议收口；
    - 领域错误是否通过 DomainError → ErrorCodes → HTTP 响应形成闭环。
- 其他 server-side lib（日志、限流、auth 等）：
  - 错误传播模式（抛错 vs. Result 类型）是否统一；
  - 是否存在错误被吞掉或全部转为 generic 500 的情况。

### 3. `src/domain/**` / `src/credits/**` / `src/payment/**` / `src/db/**`

- Credits 生命周期：
  - 增发、扣减、过期、分发 job 是否有单一来源真相（状态机/服务），还是散落多处；
  - 领域内错误是否有清晰的错误码映射和上层协议；
  - 配置（plan/policy/limits）与代码之间的耦合程度及对未来扩展的影响。
- Billing & Payment：
  - 支付 Provider 错误是否被映射到有限的、稳定的对外错误码集合；
  - 是否存在将 Provider message 直接透传给前端的风险；
  - 与 Credits 之间的边界是否清晰（谁负责扣积分，谁负责计费规则）。
- `src/db/**`：
  - Schema 与领域模型在命名、状态字段上的一致性；
  - 明显历史包袱字段（保留但不再使用）的存在情况。

### 4. `src/mail/**` / `src/newsletter/**` / `src/notification/**`

- 通知/邮件模板与错误码或业务状态的耦合强度；
- 新增错误类型/业务状态时的接入成本（模板切换逻辑是否集中）。

### 5. `messages/**` / `content/**` / `public/**`

- 错误文案与错误码的一致性：
  - `messages/**` 中是否覆盖所有已定义的错误码；
  - 文案 key 与错误码命名之间是否存在不易维护的映射方式。

### 6. `tests/**` / `scripts/**`

- 与 Credits/Billing/API error envelope 相关的测试：
  - 是否验证协议结构（JSON 形态、错误码字段）；
  - 是否覆盖关键失败路径（余额不足、plan 缺失、Provider 错误等）。
- 脚本：
  - 对 Credits/Billing/历史数据有影响的脚本是否具备安全保护（dry-run/阈值等）。

## 跨模块系统性问题（待填）

在完成各层走查后，将额外整理一节跨模块问题，包括但不限于：

- API error envelope / 错误传播模式的一致性；
- Credits 生命周期是否存在状态散落、多处写入问题；
- 错误码文档、实现与 UI 文案之间的同步风险；
- 未来演进（新增 AI 能力、新积分策略、多租户等）的主要架构阻力。

每个系统性问题将包含：

- 影响范围（涉及模块/目录）；
- 优先级（P0/P1/P2）；
- 建议整改策略（保持 KISS/YAGNI，优先内部重构，避免不必要的 breaking change）。

