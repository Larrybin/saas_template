# 仓库架构审查计划（方案一：全局健康体检 + 重点模块深挖）

## 任务背景

- 仓库：当前项目（Next.js App Router + TypeScript）
- 目标：对整个仓库进行一次架构层面的“健康体检”，重点审查：
  - `src/app/api/*`：API 设计与边界、分层与依赖方向
  - `src/app/[locale]/*`：多语言 + 路由结构、可扩展性和可维护性
- 输出形式：详细版审查报告（按维度 + 按模块的问题清单与建议），附可落地的改进 TODO 列表
- 可接受建议范围：允许提出对现有 public API 的破坏性修改建议（仅停留在方案层面，本任务不直接改代码）

## 审查维度与优先级

优先级排序（从高到低）：
1. F. 团队协作与可维护性（目录结构、命名、一致性、DX）
2. A. 分层与模块边界（领域划分、依赖方向、内聚/耦合）
3. B. 可扩展性与演进空间（新业务/新模块接入成本）
4. E. 测试与可测试性（单测/集成测试/契约测试的可行性）
5. C. 性能与资源使用（Node / Edge / DB / 调用链）
6. D. 可靠性与可观测性（错误处理、日志、监控/告警的可引入性）

## 执行步骤拆解

> 本节是后续 [模式：执行] 阶段的操作清单，当前仅规划，不实施。

### 步骤 1：项目结构与分层快速盘点

- 操作内容：
  - 扫描并梳理核心目录结构：`src/app`, `src/components`, `src/lib`, `src/hooks`, `src/stores`, `src/credits`, `src/payment`, `src/mail`, `content`, `messages` 等。
  - 从文件和命名出发，初步归纳当前的“领域模块”与“基础设施层”（例如：credits / payment / auth / marketing / shared UI / shared lib）。
  - 记录明显的跨层/跨域依赖（例如：API route 直接依赖深层实现、UI 组件直接访问数据层等）。
- 预期结果：
  - 一张文字化的“当前模块/分层全景”描述，作为后续所有审查的参照。
  - 标记出潜在的“巨石模块”或“多领域混杂”的区域。

### 步骤 2：API 层（src/app/api/*）专项审查

- 操作内容：
  - 枚举 `src/app/api/*` 下所有 route，按“领域”与“用途”分类（例如：chat、credits、billing、auth 等）。
  - 对典型代表 route（如已打开的 `src/app/api/chat/route.ts`）进行深入阅读，分析：
    - 该 route 中的职责是否单一（控制器 vs 领域逻辑 vs 基础设施调用）。
    - 是否存在业务逻辑直接堆叠在 route 层而未抽取到 lib/service。
    - 请求体验证、错误处理、返回结构是否一致且可复用（例如是否有统一 error shape / result 封装）。
    - 依赖方向是否从 API → domain/service → infra lib，避免反向依赖。
  - 标记任何与 `src/credits/*`、`src/payment/*` 等领域模块的交互方式。
- 预期结果：
  - 针对 API 层的结构化问题列表（按 F/A/B/E/C/D 打标签）。
  - 初步的“API 分层/职责分配”诊断（薄控制器程度、是否方便测试与重构）。

### 步骤 3：多语言与路由结构（src/app/[locale]/*）专项审查

- 操作内容：
  - 梳理 `src/app/[locale]/*` 下的 segment、layout、page 组织方式，重点关注：
    - `(marketing)`、`(pages)` 等分组的设计是否清晰地表达出领域/用途边界。
    - locale 与业务域的耦合程度：是否容易为新 locale / 新页面扩展。
    - 是否存在重复逻辑/组件可抽取到 `src/components` 或 `src/lib`。
  - 结合 i18n 相关目录（如 `messages/`），检查：
    - 文案/翻译资源组织方式是否统一、可维护。
    - 路由与文案的对应关系是否清晰（是否存在“写死” locale 的路径/逻辑）。
- 预期结果：
  - 对多语言路由结构的优点与问题进行总结。
  - 提出“如何在不破坏现有行为的前提下，提高新增 locale/页面时的 DX 与可维护性”的建议。

### 步骤 4：按维度的综合健康体检（F/A/B/E/C/D）

- 操作内容：
  - 基于步骤 1–3 收集的信息，对整个仓库在六个维度上进行评分和说明：
    - F（可维护性/DX）：目录、命名、约定一致性、类型定义位置、常用模式（例如 error handling、数据获取模式）。
    - A（分层与边界）：模块内聚度、跨域依赖、耦合点位置，是否有明显的“上层依赖下层”的规范。
    - B（可扩展性）：添加新 API、新业务模块、新 locale 的成本与步骤复杂度。
    - E（测试与可测试性）：现有测试分布、关键模块的测试缺口、代码结构是否易于引入测试。
    - C（性能）：API 和页面的数据流动方式、缓存和流式渲染的潜力或风险点。
    - D（可靠性与可观测性）：错误处理、日志点、未来接入监控/追踪的可行性。
  - 对每个维度输出：
    - 评分（粗粒度，例如：优秀 / 一般 / 警示）。
    - 2–5 个代表性问题或亮点。
- 预期结果：
  - 一份按维度结构化的“架构体��小结”，易于横向对比和后续跟踪改进。

### 步骤 5：问题清单与改进建议整理

- 操作内容：
  - 将前面收集的问题按如下维度整理成列表：
    - 所在模块（例如：`src/app/api/chat/route.ts`、`src/credits/distribute.ts`、`src/app/[locale]/(marketing)` 等）。
    - 影响维度（F/A/B/E/C/D，多选）。
    - 严重程度（例如：高 / 中 / 低）。
    - 建议类型：
      - 渐进式改进（可向后兼容、不改 public API）。
      - 需要破坏性 API 调整的建议（清楚标注影响范围与风险）。
  - 将建议进一步整理成“可执行任务项”，适合直接拆为 issue：
    - 任务标题（短句）。
    - 简要问题描述。
    - 推荐改进方向（不写具体实现代码）。
- 预期结果：
  - 一份详细的架构审查报告提纲/框架。
  - 一组可以直接进入 roadmap / issue 的任务候选列表。

## 交付物形式约定

- 本次架构审查的主要交付物包括：
  - 一份结构化的文字报告（在本对话中输出为主，必要时可同步存入项目内文档，如 `docs/architecture-review.md`，仅在后续任务中执行）。
  - 一份按模块/维度整理的问题与建议清单。
  - 一组可直接转化为 issue 的改进任务列表（不含具体实现细节）。

## 前端 DomainError / Envelope 处理规范（记录）

- safe-action / API 在前端统一视为 Envelope：
  - 成功：`{ success: true, ... }`
  - 失败：`{ success?: false, error?: string, code?: string, retryable?: boolean }`
- 通用 helper：`src/lib/domain-error-utils.ts` 中提供
  - `EnvelopeWithDomainError<TSuccess>` 类型别名；
  - `unwrapEnvelopeOrThrowDomainError<TSuccess>(data, { defaultErrorMessage, handleAuthEnvelope })`：
    - `data` 为空 → 抛出 `defaultErrorMessage`；
    - `success === true` → 返回成功分支；
    - `success === false` → 可选通过 `handleAuthEnvelope` 交给 `useAuthErrorHandler` 处理鉴权错误（`AUTH_UNAUTHORIZED` / `AUTH_BANNED`），然后用 `getDomainErrorMessage(code)` 生成用户可见错误信息并抛出带 `code` / `retryable` 的 `Error`。
- 已接入的前端 hook 示例（横向小整洁）：
  - `src/hooks/use-credits.ts`：credits 余额 / 统计 / 交易 / 消费；
  - `src/hooks/use-payment.ts`：订阅状态 / 终身会员状态；
  - `src/hooks/use-newsletter.ts`：newsletter 订阅状态 / 订阅 / 退订；
  - `src/hooks/use-users.ts`：后台用户列表查询。
- 约定：
  - 新增依赖 safe-action envelope 的 hooks 时，优先复用 `unwrapEnvelopeOrThrowDomainError` + `handleAuthFromEnvelope(useAuthErrorHandler())`，避免在组件或 hook 内部手写错误分支和鉴权判断。

## 执行约束

- 本任务仅进行“审查与建议”，不直接修改业务代码或配置。
- 遵循现有工程规范（AGENTS.md 中的约定），所有建议优先考虑：
  - KISS、YAGNI、DRY、SOLID。
  - 渐进式演进优先，破坏性调整以“方案建议”形式出现。
