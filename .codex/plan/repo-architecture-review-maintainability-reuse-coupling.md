# 仓库架构审查计划：可维护性 / 复用性 / 耦合度

## 一、任务背景

- 目标：对当前仓库进行一次横向的架构与代码质量审查，聚焦三个维度：
  - 代码可维护性（可读性、复杂度、职责边界、测试支撑等）
  - 高复用（抽象质量、共享模块、避免重复实现）
  - 低耦合（领域边界清晰度、依赖方向、分层合理性）
- 输出：一份结构化中文报告，每个维度包含：
  - 全局定性评价
  - 2–4 个代表性示例（含文件路径）
  - 3–6 条按优先级排序的改进建议（说明收益与影响范围）

## 二、分析范围

- 顶层文档与配置：
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `tsconfig.json`
  - `src/routes.ts`
  - `src/db/schema.ts`
- 主要业务与领域模块：
  - `src/credits/**`
  - `src/domain/**`
  - `src/payment/**`
  - `src/lib/**`
  - `src/lib/server/**`
  - `src/hooks/**`
  - `src/storage/**`
  - `src/ai/**`
  - `src/newsletter/**`
  - `src/mail/**`
  - `src/notification/**`
- UI 与接口层：
  - `src/app/**`
  - `src/components/**`
  - `src/actions/**`

## 三、执行步骤

### 步骤 1：全局上下文收集

- 阅读核心文档与配置：
  - `README.md`、`AGENTS.md`、`CLAUDE.md`
  - `tsconfig.json`
  - `src/routes.ts`
  - `src/db/schema.ts`
- 目标：
  - 建立模块地图：UI / actions / domain / services / infra(db、storage、notification 等)
  - 识别主要领域边界：credits、billing/payment、AI、storage、newsletter 等

### 步骤 2：维度一 - 可维护性审查

- 抽样 UI 层：
  - `src/app/[locale]/(protected)/settings/**`
  - `src/components/settings/credits/**`
  - `src/components/layout/**`
- 抽样业务/服务层：
  - `src/credits/**`（尤其 `services`、`domain`、`distribute.ts`）
  - `src/domain/billing/**`
  - `src/payment/services/**`
  - `src/lib/server/**`
- 测试与可验证性：
  - `src/credits/**/__tests__/**`
  - `src/domain/billing/**/__tests__/**`
  - `src/app/api/__tests__/**`
- 输出要点：
  - 全局可维护性评价
  - 2–3 个正面示例与 2–3 个反面示例

### 步骤 3：维度二 - 复用性 / 抽象质量审查

- 识别复用层：
  - `src/lib/**`（认证、日志、server、domain 错误等）
  - `src/hooks/**`
  - `src/components/ui/**`
  - `src/components/shared/**`
  - `src/credits/services/**`、`src/domain/**` 中的 domain/service 抽象
- 检查重复模式：
  - 错误处理与 DomainError 使用模式是否统一
  - 日志与监控是否通过统一封装（例如 `getLogger`）
  - credits / billing / payment / AI 在 credits 使用上的重复逻辑
- 输出要点：
  - 当前复用与抽象层的优点与薄弱点
  - 2–4 处正面示例与 2–4 处明显可抽象/复用的重复模式

### 步骤 4：维度三 - 耦合度 / 边界清晰度审查

- 分析领域边界与依赖方向：
  - `src/credits` 与 `src/domain/billing` / `src/payment` / `src/lib/server` 之间的调用关系
  - `src/actions/**` 与 domain/service/infra 的关系
- 分层解耦情况：
  - UI (`src/app`, `src/components`) 是否通过清晰的接口访问 domain/service，而不是直接操作 infra
  - infra 层模块：`src/db`、`src/storage`、`src/notification`、`src/mail` 等是否作为独立层被依赖
- 识别典型耦合问题：
  - 交叉 import，循环依赖风险
  - feature flags / 配置散落问题
- 输出要点：
  - 耦合度与边界清晰度的全局评价
  - 2–4 个边界健康示例与 2–4 个边界模糊/耦合偏重示例

### 步骤 5：报告整理与优先级建议

- 按三个维度分别撰写：
  - 现状与特点总结
  - 代表性示例（文件路径 + 简要说明）
  - 改进建议（按 P0/P1/P2 优先级排序，说明预期收益）
- 汇总成一份整体“架构体检报告”，用于后续拆解具体重构任务。

## 四、注意事项

- 遵循 KISS / YAGNI / DRY / SOLID 原则进行分析与建议。
- 不在本次任务中进行代码重构，只输出分析与建议。
- 优先关注 credits / billing / payment / AI 等核心业务路径。

## 五、本轮执行记录（2025-12 基线复核）

- 执行模式：方案 2（完全重跑新基线报告），在保留报告结构的前提下，重新评估可维护性 / 复用性 / 耦合度，对齐当前代码状态。
- 覆盖范围：根目录文档（`README.md`、`AGENTS.md`、`docs/*`）、核心域模块（`src/credits/**`、`src/payment/**`、`src/domain/**`、`src/lib/**`、`src/ai/**`、`src/storage/**`、`src/mail/**`）、接口与 UI 层（`src/app/**`、`src/actions/**`），以及测试与测试辅助（`src/**/__tests__/**`、`tests/**`）。
- 输出落点：重写 `.codex/plan/repo-architecture-review-maintainability-reuse-coupling-report.md` 作为 2025-12 新基线版本，为后续架构治理与技术债拆分提供依据。
