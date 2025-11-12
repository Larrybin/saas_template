# 任务：Credit Distribution Stage B

## 背景
- 需要拆出 CreditDistributionService，并引入 periodKey 唯一约束实现幂等批处理。
- 允许数据库 schema 变更，采用 feature flag 逐步启用。

## 计划
1. 新增 period_key 字段与唯一索引（Drizzle migration），并提供分批回填与回滚说明。
2. 引入 feature flag（enableCreditPeriodKey），在 Domain Service/新 Service 中读取。
3. 实现 CreditDistributionService + CreditCommand 模型，封装 free/lifetime/yearly 逻辑。
4. 重写 distribute.ts，使其调用新 Service，原地保留 batch & logging。
5. 支持 periodKey 写入 & 兼容旧查询；分阶段可控启用。
6. 补充测试（Distribution service + domain periodKey）并运行 lint/test。
