# 类型错误修复计划\n\n
阶段：计划
1. 修复 src/credits/__tests__/distribute-credits-job.test.ts
   - 目标：避免直接索引未断言长度的数组，利用结构赋值和 NonNull 断言。
   - 步骤：获取 executions 后通过 const [freeExec, lifetimeExec, yearlyExec] = executions as ... 或手动校验；保持断言简单。

2. 修复 src/mail/__tests__/mail-service.test.ts 与 src/mail/provider/__tests__/resend-provider.test.ts
   - 目标：补充 Vitest hooks 导入，回滚配置时提供非 undefined 兜底，mock 函数签名与真实实现一致。
   - 步骤：在 import 中引入 afterAll/afterEach；设置 fallback 邮箱（如 originalMailConfig.fromEmail ?? 'alerts@example.com'）；getTemplateMock 函数声明接受参数。

3. 修复 tests/helpers/payment.ts 与相关测试
   - 目标：InMemoryPaymentRepository 与 PaymentRepositoryLike 完全对齐，事务句柄使用 DbExecutor；createWebhookDeps 返回类型不再是联合；webhook-handler-credit 测试对 mock 调用做存在性检查。
   - 步骤：引入 PaymentRecord/DbExecutor 类型；把内部 map 存储保存 PaymentRecord（带 createdAt 等字段）；withTransaction 接受 handler: (tx: DbExecutor) => Promise<T> 并在内部用 Symbol 代表 tx 实例；creditsGateway.addCredits.mock.calls 访问时断言已调用。

4. 验证
   - 目标：运行 
px tsc --noEmit，确保零错误。
   - 若失败，根据输出回到对应步骤调整。
