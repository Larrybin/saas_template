# 协议治理第 1 轮：静态守护与基线对齐

> 对应技术债条目：#1、#2、#3、#4、#11、#15、#20  
> 范围：仅涉及协议/错误模型的静态守护、API ↔ 文档对齐检查，以及错误码治理流程（不改业务逻辑）。

---

## 1. 目标

- 将 `scripts/check-protocol-and-errors.ts` 提升为统一的协议/错误模型静态守护入口，并在 CI 中强制执行。
- 提供一个轻量的「API ↔ docs/api-reference.md」对齐检查，避免路由实现与文档清单长期漂移。
- 为错误码变更建立可执行的 checklist，并通过 PR 模板将其纳入日常开发流程。

---

## 2. 已落实的工作

### 2.1 扩展协议静态守护脚本

- 文件：`scripts/check-protocol-and-errors.ts`
- 变更要点：
  - 保留原有检查：
    - `checkApiEnvelopes`：检查 `/api/*` 路由的 JSON Envelope 是否包含 `success` 字段；
    - `checkSafeActions` / `checkActionsUseErrorBoundary` / `checkActionErrorEnvelopes`：约束 Server Actions 使用 safe-action + 统一错误包装；
    - `checkErrorCodesDocumented` / `checkErrorUiRegistry` / `checkDomainErrorCodes`：约束 ErrorCodes ↔ 文档 ↔ UI registry 与 `DomainError` 引用的一致性。
  - 新增：
    - `API_DOC_FILE = 'docs/api-reference.md'` 常量；
    - `checkApiDocsReferences(repoRoot, violations)`：
      - 扫描 `src/app/api/**/route.ts`，构建路由列表（形如 `/api/foo/bar`）；
      - 扫描 `docs/api-reference.md` 中使用反引号包裹的 `/api/...` 路径（形如 `` `/api/foo/bar` ``）；
      - 对「代码存在但文档未提及」的路由追加 `warn` 级 violation（不阻断 CI，只输出提示）。
    - 在 `main()` 中调用 `checkApiDocsReferences`。

### 2.2 在 CI 工作流中接入 `pnpm check:protocol`

- 文件：`.github/workflows/ci.yml`
- 变更要点：
  - 在 `lint` job 中，在 `pnpm lint` 与 `pnpm exec tsc --noEmit` 之间新增 step：
    - `Protocol & error model checks`：运行 `pnpm check:protocol`。
  - 效果：
    - 任意 PR / push 在进入类型检查前必须通过协议/错误模型守护；
    - API Envelope、Server Actions、安全包装、错误码文档 & UI registry 与 API ↔ docs 对齐检查均由 CI 统一执行。

### 2.3 补充错误码变更 checklist

- 文件：`.codex/plan/error-codes-expansion.md`
- 变更要点：
  - 在文档末尾增加「## 错误码变更 checklist」小节，内容包括：
    1. **集中声明**：更新 `src/lib/server/error-codes.ts`；
    2. **文档同步**：更新 `docs/error-codes.md`；
    3. **前端 UI 行为**（如适用）：更新 `src/lib/domain-error-ui-registry.ts`；
    4. **领域 / 协议文档**：更新对应 `docs/*-lifecycle.md` 或相关说明；
    5. **协议报告 / 计划文档**：视跨领域影响，更新 `.codex/plan/protocol-future-techdebt-report.md` 与相关 `.codex/plan/*`。

### 2.4 在 PR 模板中挂载协议 / 错误码 checklist

- 文件：`.github/pull_request_template.md`（新增）
- 内容要点：
  - 「协议与错误码检查」小节：
    - [ ] 若修改 `/api/*` 或 `src/actions/*`：已运行 `pnpm check:protocol` 并处理错误/警告；
    - [ ] 若新增/修改错误码：已按 `.codex/plan/error-codes-expansion.md` 中的 checklist 更新代码与文档；
    - [ ] 若涉及协议/错误模型重大变更：已评估并（如必要）更新 `protocol-future-techdebt-report.md` 与相关 docs/plan 文档。
  - 同时提供基础的「变更类型」「测试」等通用选项。

---

## 3. 与技术债条目的映射

- `#1 协议一致性 / API`  
  - 通过 `checkApiEnvelopes` + `pnpm check:protocol` + CI 接入实现自动化守护。
- `#2 协议一致性 / Actions`  
  - 通过 safe-action 检查与统一错误包装检查的脚本守护，并在 CI 中强制执行。
- `#3 API ↔ 文档 对齐`  
  - 通过 `checkApiDocsReferences` 提供轻量级路由 ↔ 文档差异提示（warn 级）。
- `#4 ErrorCodes ↔ 文档/前端 映射`  
  - 通过错误码/文档/UI registry/DomainError 引用检查守护，并在 CI 中执行。
- `#11 协议与错误模型 CI 守护`  
  - 通过将 `pnpm check:protocol` 接入 `.github/workflows/ci.yml` 的 `lint` job 落地。
- `#15 ErrorCodes 扩展策略缺少可执行 checklist`  
  - 通过在 `.codex/plan/error-codes-expansion.md` 中补充 checklist 解决。
- `#20 协议/技术债报告与 .codex/plan 同步机制依赖人工`  
  - 通过在 PR 模板中引入「是否需要更新 `.codex/plan` / docs」的 checklist，降低完全依赖人工记忆的风险。

---

## 4. 后续轮次衔接说明

- 第 2 轮（Webhook + Credits 安全/可观测性）：  
  - 可以依赖本轮已接入 CI 的 `pnpm check:protocol`，确保新增/调整的协议路径不会破坏 Envelope 和错误码约定；
  - 调整 Webhook 状态码/错误码/日志时，应遵守错误码 checklist 与 PR 模板的约束。
- 第 3 轮（Docs / Source / env / span 映射）：  
  - 可在本轮的 API ↔ docs 差异检查基础上扩展更精细的映射逻辑；
  - env ↔ 协议行为映射表与 span ↔ 文档映射脚本可继续集成到现有检查脚本或单独脚本中。

本轮工作完成后，协议与错误模型的静态守护已经纳入 CI 基线，后续各轮改动可以在此基础上持续演进，而无需为基础守护重复造轮子。

