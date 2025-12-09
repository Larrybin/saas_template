# 其他域审查报告（AI / Analytics / Actions / Newsletter / Notification / Mail / Components 等）

## 基线
- 通用：配置注入、幂等、错误边界、日志/指标、按路由/故事组织测试（goldbergyoni）。

## 评分概览
- 正确性与鲁棒性 3
- 可读性 3.5
- 一致性 3
- 复杂度 3
- 性能 3
- 安全性 3
- 可测试性 2.5
- 扩展性 3
- 依赖与边界 3
- 日志与可观测性 2.5
- 测试覆盖 2.5

## 发现表（代表性、复核 2025-12-09）
- 中 | src/actions/ensure-access-and-checkout.ts:78-118 | 编排外部服务仍无幂等/重试，错误直接抛 `DomainError`；仅在“已拥有权限”时写 info 日志 | 正确性/鲁棒性 | 基线：幂等/补偿
- 中 | src/notification/discord.ts:30-99; src/notification/feishu.ts | 通知失败依旧只记录 error，不重试也不产生日志指标 | 鲁棒性/可观测性 | 基线：可观测性
- 低 | src/mail/provider/resend.ts; src/newsletter/provider/* | Provider 仍为硬编码实现，失败直接返回 `success: false`，无注入/重试/metrics | 扩展性/鲁棒性 | 基线：配置注入
- 低 | Analytics 组件（src/analytics/*.tsx） | 生产环境直接渲染多个脚本，无错误边界/降级或 `try/catch` | 正确性/鲁棒性 | 基线：错误边界

## 测试缺口表
- Actions：成功/失败/重试路径，输入校验错误，外部异常。
- Notification/Mail：发送失败重试与告警，模板渲染错误。
- Analytics：禁用/隐私模式，加载失败降级。
- Components：可访问性/错误边界。

## 建议表
- 高 | 为关键 actions（checkout/权限）添加幂等键与日志，失败提供结构化错误与可重试策略 | 依据：ensure-access-and-checkout.ts:78-120
- 中 | 通知/邮件增加重试策略与指标/告警，提供方通过配置注入 | 依据：notification/*.ts; mail/newsletter providers
- 低 | Analytics/组件增加错误边界与降级；补可访问性测试 | 依据：analytics/*.tsx

## 简短摘要
主要问题是编排幂等/重试不足、通知/邮件缺重试与指标、Analytics 缺降级；需强化幂等与可观测性并补测试。***
