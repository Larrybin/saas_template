# 全域代码审查计划（静态审查，仅代码 + 测试，排除 .md/.mdx/.mdc）

## 域顺序
1) 积分
2) 支付
3) 存储
4) 代理
5) 纯领域（billing/membership/plan）
6) 路由/守卫
7) 其他域（ai、analytics、actions、newsletter、notification、mail、components/assets/styles、config/env/i18n、lib/hooks/stores/types/db）

## 每域原子步骤
- 基线获取：使用 context7 拉取该域最佳实践，记录来源库/字段/适用点。
- 代码遍历：该域所有代码文件 + tests/__tests__（排除 .md/.mdx/.mdc），逐文件走读，记录证据（路径:行）。
- 评分矩阵：10 维度 + “测试覆盖”行，1–5 分 + 简短理由。
- 发现表：级别 | 文件:行 | 描述 | 受影响维度 | 基线引用。
- 测试缺口表：用例类型 | 涉及文件/模块 | 优先级（包含测试代码）。
- 建议表：优先级 | 措施 | 依据（代码证据 + 基线来源）。
- 简短总览摘要。
- 输出：生成/覆盖 `reports/<domain>-review.md`。

## 收尾
- 完成全部域后，生成 `reports/overall-review.md` 汇总评分与优先级整改。

## 约束
- 仅静态审查，不运行命令。
- 所有发现需附文件路径+行号和基线来源。
- 必须引用测试代码的发现/覆盖缺口。
