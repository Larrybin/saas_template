# Task: 补充 Credits/Payment/Mail 测试覆盖

## 背景
- `test-metrics.json` 显示 `src/credits/*`、`src/payment/services/*`、`src/mail/*` 仍存在 0-30% 的语句覆盖率。
- `coverage/coverage-final.json` 中 `src/credits/distribute.ts`、`src/payment/services/webhook-handler.ts`、`src/mail/index.ts` 等文件行号处于未命中状态。
- 目标：基于共享测试基建（Fake repository/provider），以最小 Mock 实现高价值单元/集成测试，并在 PR 中可引用具体行号解释补 Coverage 的原因。

## 计划
1. **搭建共享测试基建**
   - 新建 `tests/helpers/credits.ts` 等文件，提供 `createCreditDistributionServiceStub`、`createMembershipServiceStub` 等工具，减少重复 Mock。
   - 添加 in-memory payment repository、mail provider fake，供多个测试重用。

2. **补充 Credits 模块测试**
   - 新增 `src/credits/__tests__/distribute-credits-job.test.ts`，模拟不同订阅场景，验证 `distributeCreditsToAllUsers` 统计（覆盖 `distribute.ts:263-394` 分支）。
   - 扩展 data-access 层必要 stub，确保 free/lifetime/yearly Paths 均被命中。

3. **补充 Payment Services 测试**
   - 使用共享 fake repository/网关，为 `src/payment/services/webhook-handler.ts` 添加针对 credit purchase & onetime payment 的集成测试。
   - 校验 `deps.billingService`、`deps.creditsGateway` 调用及 `PaymentRepository` withTransaction 行为，命中 `webhook-handler.ts:195-299`。

4. **补充 Mail 模块测试**
   - 为 `src/mail/index.ts` 和 `src/mail/provider/resend.ts` 添加单元测试，借助 fake provider/Resend stub，覆盖初始化、模板渲染、字段缺失等分支。
   - 确保 `getTemplate` 错误路径与 `sendRawEmail` 字段校验被断言。

5. **验证与文档**
   - 运行 `pnpm test --coverage` 更新报告，截取相关行号。
   - 整理 PR 描述：引用 `test-metrics.json` 模块统计与 coverage 行号，说明每个新增测试的补充点。

## 执行记录
- 2025-12-01：完成共享 Fake（`tests/helpers/{credits,payment,mail}.ts`），并新增以下套件：
  - `src/credits/__tests__/distribute-credits-job.test.ts`（free/yearly/lifetime 批处理、日志断言）。
  - `src/payment/services/__tests__/webhook-handler-credit.test.ts`（credit purchase + 一次性订单事务逻辑）。
  - `src/mail/__tests__/mail-service.test.ts`、`src/mail/provider/__tests__/resend-provider.test.ts`（provider 缓存、必填字段、模板渲染管道）。
- 以 `node node_modules/vitest/vitest.mjs run --coverage` 跑通全量 192 个测试，验证新套件稳定无超时。
- 2025-12-01（追加）：修复 mail/resend 测试的全局配置污染，强化 `tests/helpers/payment.ts` 以强制事务句柄与 CreditsTransaction 对齐，并在 `webhook-handler-credit.test.ts` 中新增 package 缺失/重复会话/网关异常等失败分支断言，命中 `webhook-handler.ts:232-299` 的 return path。

## 覆盖行号引用
- Credits：`distribute-credits-job.test.ts` 命中 `src/credits/distribute.ts:263-357`（批处理指标/日志）、`src/credits/distribute.ts:296-345`（misconfigured paid fallback），可在 PR 中引用 `coverage/src/credits/distribute.ts.html#L263`。
- Payment Services：`webhook-handler-credit.test.ts` 覆盖 `src/payment/services/webhook-handler.ts:195-300`，确保 `onOnetimePayment`、`onCreditPurchase` 两条支路与 `PaymentRepository.withTransaction` 逻辑被命中。
- Mail：`mail-service.test.ts` 覆盖 `src/mail/index.ts:27-111`（provider 初始化 + sendEmail 双路径），`resend-provider.test.ts` 命中 `src/mail/provider/resend.ts:33-200`（env 校验、模板渲染失败、sendRawEmail 缺失字段）。

## test-metrics 佐证
- `test-metrics.json` 显示 `src/credits` 仅 8 个测试/26 次断言，`vi.fn` 调用 14 次。上述共享 Fake 减少新增 Mock，同时把断言集中在处理结果与日志行上，符合 `.codex/rules/testing-strategy-best-practices.md` 对“低 Mock 密度”的要求。
- `src/payment/services` 维度有 11 个测试但 `expect` 仅 32 次、`mockImplementation` 高达 13 次。`webhook-handler-credit.test.ts` 通过 Fake repository + `withTransaction` 跑真逻辑，将 Mock 降为 `vi.fn` 依赖注入，改善断言密度。
- `src/mail` 在 metrics 中 `tests=0`，此次补齐 2 套件后，`expect`/`mock` 分布与模块复杂度对齐，为 `mail/index.ts` 和 `provider/resend.ts` 提供回归基线。
