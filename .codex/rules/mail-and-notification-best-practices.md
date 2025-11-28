---
title: 邮件、通知与 Newsletter 最佳实践
description: 基于 MkSaaS 模板的邮件、站外通知与 Newsletter 设计规范
---

## 适用范围

- 邮件系统：`src/mail/*`（组件、模板、provider、sendEmail API）
- Newsletter：`src/newsletter/*`
- 通知集成：`src/notification/*`
- 相关文档：`src/mail/README.md`、`src/newsletter/README.md`、`docs/feature-modules.md`

## 设计目标

- 将所有“对外沟通”能力统一抽象为可复用的邮件 / 通知 / Newsletter 模块。
- 区分事务型邮件（transactional）与营销型邮件（marketing），避免耦合。
- 支持多语言模板与 provider 可插拔，实现高内聚、低耦合。

## 核心原则

1. **按渠道与用途分层**
   - 事务型邮件：注册验证、重置密码、Credits 变更通知等 → `src/mail/templates/*`。
   - 营销型邮件 / Newsletter：促销活动、产品更新等 → `src/newsletter/*`。
   - 第三方通知：Discord / 飞书等运维通知 → `src/notification/*`。

2. **统一模板渲染与 i18n**
   - 所有邮件模板使用 React 组件，并统一从 i18n messages 中读取文案（subject / body 文案 key）。
   - 模板 props 与模板注册集中在 `src/mail/types.ts` 中维护，保证类型安全。

3. **Provider 抽象**
   - `src/mail/provider/*`、`src/newsletter/provider/*` 只负责与外部服务（如 Resend、邮件列表服务）对接。
   - 业务层只调用 `sendEmail` / Newsletter API，不直接依赖具体 provider SDK。

4. **幂等性与重复发送控制**
   - 对敏感操作（如订阅确认、账户安全相关通知）应设计幂等策略：
     - Idempotency key（如 userId + 事件类型 + 时间窗口）。
     - 后端记录最近一次发送时间，避免短时间内重复触发。

5. **用户偏好与退订**
   - Newsletter 与营销邮件必须尊重用户退订状态。
   - 事务型邮件可不允许退订（如安全通知），但需文案说明用途。

## 实践要点（结合本仓库）

1. 邮件系统
   - `src/mail/index.ts` 暴露 `sendEmail`，支持模板发送与 raw email。
   - `src/mail/templates/*` 已包含：
     - `verify-email`、`forgot-password`、`subscribe-newsletter`、`contact-message` 等典型模板。
   - `src/mail/README.md` 详细说明了模板扩展步骤与 i18n subject 的维护方式。

2. Newsletter
   - `src/newsletter/index.ts` 定义 Newsletter API（订阅、退订、检测状态），内部依赖 provider。
   - `src/newsletter/README.md` 提供了实现自定义 provider 的示例。
   - 与 Auth 用户生命周期（如注册时自动订阅）可以通过 user-lifecycle Hook 进行集成。

3. 通知渠道
   - `src/notification/*` 提供了 Discord / 飞书等基础实现，适合用于运维、告警通知。
   - 建议在特定领域事件（如 Credits 分发失败、Stripe Webhook 异常）上配置通知逻辑，而不是散落在业务代码中。

## 反模式（应避免）

- 在业务代码中直接调用外部邮件 / 通知 SDK，而绕过 `src/mail` / `src/notification` 抽象。
- 将事务型邮件与营销邮件混在同一逻辑里，不区分退订策略。
- 模板使用硬编码字符串，未接入 i18n 或未在 messages 中登记。

## Checklist

- [ ] 所有邮件发送都通过 `sendEmail`，并使用集中管理的模板与 subject 文案。
- [ ] Newsletter 订阅 / 退订流程与 UI 有明确边界与持久化状态。
- [ ] 关键运维事件（如支付 / Credits / AI Provider 异常）有至少一个通知渠道。
- [ ] 对用户可感知的重复邮件有幂等与节流策略。

## 实施进度 Checklist

- 已基本符合
  - [x] `src/mail/*` 已提供完善的模板体系与 Resend provider，`sendEmail` 支持模板与 raw 内容发送。
  - [x] `src/newsletter/*` 抽象了 Newsletter provider，并在 README 中给出扩展指引。
  - [x] `src/notification/*` 为 Discord / 飞书等外部通知提供了独立模块，便于运维集成。
- 尚待调整 / 确认
  - [ ] Newsletter 与营销类邮件的退订与用户偏好模型是否已在业务层完全落地（包括 UI 与数据结构）。
  - [ ] 核心事务型邮件（如安全相关）是否在 docs 中明确标注“不受退订影响”的策略。
  - [ ] 对高频触发邮件（如 contact、newsletter）是否已有发送频率限制与幂等控制。

