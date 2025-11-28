# 治理索引（Architecture & Governance Index）

> 目标：为团队提供一个单一入口，快速定位当前仓库的架构审查、协议与技术债报告文档。代码层面的详细分析仍以各自报告为准。

## 1. 架构与代码质量报告

- **仓库架构体检：可维护性 / 复用性 / 耦合度 / 测试支撑**  
  - 报告：`.codex/plan/repo-architecture-review-maintainability-reuse-coupling-report.md`  
  - 说明：从全局角度评估当前代码的可维护性、复用性、耦合度和测试支撑情况，并给出按 P0/P1/P2 排序的架构改进建议和影响范围矩阵。
  - 配套计划：`.codex/plan/repo-architecture-review-maintainability-reuse-coupling.md`

- **协议 / 未来演进 / 技术债 审查报告**  
  - 报告：`.codex/plan/protocol-future-techdebt-report.md`  
  - 说明：聚焦 API 协议、一致性、未来演进能力以及技术债量化（优先级 + 人天估算），是协议层和错误码的“单一事实来源”。
  - 配套计划：`.codex/plan/protocol-future-techdebt.md`

## 2. 使用建议

- 进行「协议 / 错误码 / Envelope 变更」时：  
  - 先查阅 `protocol-future-techdebt-report.md`，确认现有约定与技术债项；  
  - 若改动影响架构边界（如 credits/billing/payment/AI 的分层），再参考 `repo-architecture-review-maintainability-reuse-coupling-report.md` 中的相关建议与影响矩阵。

- 规划中长期重构或大规模重组模块时：  
  - 以本索引为入口，结合上述两份报告的 P0/P1/P2 建议拆分具体任务，必要时在 `.codex/plan` 下新增对应的细化 plan 文档，保持“plan ↔ report ↔ 实际改动”三者同步。
