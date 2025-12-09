# 全局汇总（静态审查）

## 域评分摘要
- 积分：正确性 2.5 / 可观测 2.5 / 主要问题：缺事务+唯一索引幂等。
- 支付：正确性 3 / 可观测 2.5 / 主要问题：provider 选择不一致、webhook 缺白名单/幂等键、状态回填缺失。
- 存储：安全 2.5 / 可观测 3 / 主要问题：上传安全校验缺失、无预签名/重试。
- 代理：安全 3 / 可观测 2.5 / 主要问题：回调校验不严。
- 纯领域：正确性 3 / 可观测 2.5 / 主要问题：续订/授予无幂等键、日志不足。
- 路由：正确性 3.5 / 可观测 2.5 / 主要问题：守卫配置分散、缺日志测试。
- 其他域：可测试 2.5 / 可观测 2.5 / 主要问题：actions 幂等/重试、通知/邮件无指标、analytics 缺降级。

## 高优先级整改
1) 积分幂等与原子性：事务化余额+流水；DB 唯一索引 userId+type+periodKey；幂等日志（credit-ledger-domain-service.ts:108-146; credit-ledger-repository.ts:25-46; credit-ledger-service.ts:125-235）。  
2) 支付事件安全：统一 provider 选择；webhook 事件白名单+eventId 幂等持久化；签名失败/重复记录日志+指标；支付状态回填（stripe-webhook-handler.ts:46-77; provider-factory.ts:48-66）。  
3) 存储安全：上传 contentType/大小白名单，预签名 URL（仅 HTTPS），重试+指标，配置校验（s3.ts:95-173; index.ts:32-42）。  
4) 代理/路由安全：回调仅允许相对路径拒绝 `//`/绝对 URL；守卫列表单一来源并补日志/测试（proxy/helpers.ts:85-95; routes.ts:70-80）。  
5) 领域幂等：续订/授予增加幂等键与结构化日志（billing-service.ts:82-120）。

## 中优先级
- 策略/配置注入：积分策略、存储 provider、支付 provider 配置校验与注入。  
- 可观测性：统一结构化日志字段（userId/planId/priceId/periodKey/provider/eventId/batchId），关键操作输出 metrics/告警。  
- 通知/邮件/Actions：重试+指标，幂等键，错误边界。

## 测试补强
- 并发/幂等/失败回滚（积分、支付）。  
- Webhook 重放/未知事件/验签失败。  
- 存储安全/重试；路由/回调安全。  
- 续订/授予幂等；Actions 成功/失败/重试；通知/邮件发送失败与模板错误；Analytics 降级/隐私模式。
