# 任务：Ledger Domain 分层阶段A

## 背景
- distribute.ts 与 credit-ledger-service.ts 混合 SQL + 业务规则，事务边界模糊。
- 目标阶段A：抽象 repository 接口，创建 Domain Service，将现有 SQL 迁移至该服务，并让 credit-ledger-service 作为 Facade。

## 计划
1. 梳理 credit ledger 相关函数与 SQL，以便逐一迁移。
2. 定义 ICreditLedgerRepository 接口，并让现有 repository 实现它，移除隐式 getDb()。
3. 新建 CreditLedgerDomainService：封装 add/consume/processExpired/canAdd 等逻辑，统一依赖 repository+executor。
4. 重写 credit-ledger-service.ts：调用 Domain Service，暴露原 API。
5. 更新调用点（暂以 service 自身为主），确保 lint/type 通过。
