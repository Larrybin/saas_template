# 协议 / 未来演进 / 技术债 全量审查计划

## 上下文
- 任务：对仓库内所有协议、未来架构演进能力以及技术债进行一次系统性盘点，并输出单独报告。
- 范围：仅使用仓库内文档与代码（`docs/`, `src/`, `content/`, `messages/`, `public/`, `tests/` 等）；聚焦 App Router、API Route、支付/积分/日志等核心域。
- 交付：在 `.codex/plan` 中生成本计划，完成后输出审查报告（Markdown）。
- 约束：技术债需量化（优先级 + 成本/人天），未来演进部分只做可扩展性分析，无外部依赖。

## 执行步骤
1. **协议资产盘点与分类**
   - 读取 `docs/` 下协议相关文档（`api-reference.md`, `error-codes.md`, `error-logging.md`, `developer-guide.md` 等），并用 `rg --files docs | rg` 等命令交叉定位协议关键词（API、webhook、billing、auth）。
   - 在 `src/app/api`, `src/lib`, `src/payment`, `content/` 等目录中查找实现文件，建立“协议文档 ↔ 代码”映射表，记录缺失或重复。
   - 输出：协议清单（名称、来源文档、对应实现模块）。

2. **协议一致性与覆盖核验**
   - 针对上一步得到的映射，对照代码实现（handler、schema、错误处理）与文档描述，确认字段/流程/错误码一致性。
   - 借助 Next.js App Router 约定（Context7 资料）验证 layout / route 组织是否支撑协议暴露方式。
   - 输出：差异列表（缺失、过期、冲突）及影响评估。

3. **未来演进（可扩展性）分析**
   - 阅读 `docs/architecture-overview.md`, `feature-modules.md`, `developer-guide.md` 等说明，结合代码结构（`src/` 模块划分、App Router 布局、stores/hooks）评估扩展路径：例如功能拆分、区域部署、对多协议扩展的支撑程度。
   - 引用 Next.js 官方最佳实践（已通过 Context7 查询）对比当前实现，识别扩展瓶颈（共享状态、耦合 API、缺少 domain boundary）。
   - 输出：扩展性评分、阻塞因素及建议（无需路线图，但需覆盖短中期演进角度）。

4. **技术债量化梳理**
   - 使用 `rg "TODO|FIXME"`、查阅 `package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`biome.json` 等找出代码/配置层技术债：测试缺口、日志不一致、依赖老化、脚手架差异等。
   - 为每条技术债提供：描述、影响面、优先级（P0-P2）、成本（以人天为单位，可用 0.5/1/2/5/10d 档）。
   - 如需要执行脚本（如 `pnpm lint`）辅助验证，确保不改变生产配置。

5. **综合报告与建议**
   - 在 `.codex/plan/protocol-future-techdebt.md` 基础上汇总发现，生成最终审查报告（包含协议、未来演进、技术债三节）。
   - 报告应含：概述、详细发现、量化表格、建议/下一步。
   - 完成后进入优化与评审阶段，必要时回溯补充发现。

## 估算与依赖
- 预计用时：协议盘点 2-3h、演进评估 1h、技术债量化 2h（含估算）。
- 工具：`rg`, `ls`, `cat`, `pnpm lint`（仅读取）、Context7 文档。
- 交互：关键节点（完成每两步、报告草稿）需向用户同步并等待确认。
