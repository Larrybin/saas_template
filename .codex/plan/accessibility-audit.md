---
title: Accessibility & Interaction Audit Plan
description: 静态审查全仓库交互组件的可访问性与交互一致性
---

## 背景与目标
- 依据 `.codex/rules/accessibility-and-interactions-best-practices.md`、Radix/Shadcn 原则，对所有交互组件进行静态审查。
- 交付 `reports/accessibility-audit.md`（暂定），列出问题清单：文件路径、组件/位置、影响、推荐修复。
- 不运行自动化工具，仅阅读代码与相关文档。

## 执行步骤
1. **组件清单整理**
   - 目录范围：`src/components/ui/**`, `src/components/layout/**`, `src/components/**` 中其他交互件、`src/app/**` 页面及 `content/**` 中交互式文档示例。
   - 记录 Radix/Shadcn 包装组件、业务自定义组件（表单、模态、快捷方式）。

2. **逐组件审查**
   - 对每个交互组件，从以下维度进行静态评估：
     - 键盘可达性：tab 顺序、Enter/Space/Arrow 行为、Esc 退出。
     - 焦点管理：弹窗打开/关闭、初始焦点、焦点回退。
     - 语义与 ARIA：语义标签、`aria-*` 绑定、`role`、标签描述关联。
     - 视觉反馈：focus 样式是否被覆盖，禁用态是否清晰。
     - RTL/主题：布局方向依赖、`dir` 相关样式。
     - 与 Radix/Shadcn API 的一致性：是否绕开内置可访问性逻辑。
   - 发现问题时记录：文件+行、描述、风险、建议/链接。

3. **汇总报告**
   - 结构：概述、方法、总体发现、问题列表（表格或条目）、建议。
   - 问题优先级：阻断、高、中、低。
   - 若未发现问题，也需记录检查范围和证据。

## 依赖与注意事项
- 禁止修改业务代码，仅阅读与记录。
- 若发现需进一步验证（例如实际屏幕阅读器行为），标记为“需动态验证”。
- 评估需遵循 KISS/YAGNI/DRY/SOLID 原则，聚焦实际问题。

