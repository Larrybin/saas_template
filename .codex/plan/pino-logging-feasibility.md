# 接入 Pino 日志可行性分析

- **目标**：评估在现有 Next.js/TypeScript SaaS 模板中接入/扩展 Pino 日志的可行性，识别现状、差距与优化路线。
- **上下文**：仓库已存在 `src/lib/server/logger.ts` 全局封装（Pino + AsyncLocalStorage），广泛应用于 actions、usecases、payment、AI、notification 等模块，并在 `docs/error-logging.md`/`docs/feature-modules.md` 约定日志规范。



项目当前已通过 src/lib/server/logger.ts (line 1) 建立了 Pino 封装：在 AsyncLocalStorage 中维护 requestId/userId/span，提供 getLogger/withLogContext/createLoggerFromHeaders，并启用了 LOG_LEVEL + NODE_ENV 联动、ISO timestamp 以及敏感字段脱敏；package.json (line 114) 声明了 pino@^9.5.0，与 pnpm-lock.yaml 中的 9.14.0 实际版本一致。
使用范围覆盖 actions（如 src/actions/create-checkout-session.ts (line 10)）、usecases（src/lib/server/usecases/execute-ai-chat-with-billing.ts (line 56)）、领域服务（src/domain/billing/billing-service.ts (line 62)）、支付/积分/通知等模块，和 docs/error-logging.md (line 4) 约定的 span 命名保持一致，说明服务端场景早已统一切换到 Pino，接入成本极低；docs/feature-modules.md (line 314) 明确要求 usecase 通过 getLogger({ span, userId }) 继承上下文，也与 Pino child logger 模式吻合。
可行性结论：继续在仓库中深化 Pino 是可行且推荐的，核心原因是：1) 现有 API/Action/Job 结构已围绕该封装构建，新增模块（如计划中的 BillingService/BillingFacade）只需注入 getLogger({ span: 'domain.billing.facade' }) 即可复用上下文；2) Pino 官方最佳实践（child logger 继承、mixin 注入、redact、transport）均已具备实现土壤；3) 运行环境主要在 Node.js Route/Server Actions/Cron，符合 Pino 高性能 stdout 的假设。
差距与改进项（结合 /pinojs/pino 文档）：
传输/集中化：当前仅写 stdout，若要进入生产集中日志，需要确定 transport（pino-elasticsearch、pino-loki 或 OTLP）并将 pino.transport 封装在 src/lib/server/logger.ts 中，可按环境变量选择目标，确保与 AsyncLocalStorage child logger 兼容；
开发调试体验：本地可在 NODE_ENV=development 时配置 pino-pretty transport，提高可读性，同时保持生产 JSON 输出；
Edge/Workers 兼容：若未来在 Edge Runtime 使用日志，需要一个轻量降级（如 @vercel/edge-config + console）或 Logflare transport（pino-logflare），并在 getLogger 暴露 fallback；
运行态指标：可考虑结合 mixin/setBindings 自动添加 deploymentId、workspaceId 等租户信息，并通过 transport 将日志送往集中系统，实现跨模块追踪；
测试覆盖：测试中多处手写 getLogger: () => ({ info: vi.fn() ... })（见 src/credits/services/__tests__/credit-ledger-service.test.ts (line 15)），可抽出测试 logger stub，避免重复。
风险：设置 transport 后需关注 worker 线程在 Serverless 环境的可用性（Vercel/Cloudflare 对 Worker Threads 支持不同），以及 redact 列表是否覆盖新增字段（比如 PaymentProvider tokens）。
影响面：
BillingService/Fascade：可直接注入 getLogger({ span: 'domain.billing.facade', requestId? })，在 startSubscriptionCheckout/handleRenewal/grantLifetimePlan 中输出业务日志，无需额外封装；
Safe Actions/API：延续 docs/error-logging.md (line 33) 的 envelope 统一写法，配合 Pino error 日志即可保持一致；
运维流程：若引入 transport，需要在 pnpm deploy 流程中配置目标（例如 Loki endpoint、OTLP collector），并在 .env 增加目标地址/认证信息。

Transport/集中化日志：在 src/lib/server/logger.ts 中增加可选 pino.transport 配置，按环境变量条件启用（如 Loki、OTLP、Logflare）。运输线程在 Vercel/Node 环境可行，但需评估 Cloudflare/Edge 兼容性；可先使用 pino/file 或 pino-socket 验证。
本地调试体验：针对 NODE_ENV=development 时链路，附加 pino-pretty transport 或 mixin 输出 span 名，提升可读性，保持生产 JSON。
Edge/Workers 兼容：若需要在 Edge runtime 打日志，提供 fallback（如 pino-logflare 或简化 console wrapper），避免 AsyncLocalStorage 不可用导致报错。
测试复用：抽象 logger stub helper（位于 tests/helpers/logger.ts 或相似位置），减少测试中重复实现的伪 logger，提高 DRY。
配置可视性：将 LOG_LEVEL、redact 列表、潜在 transport 目标等记录在 docs/error-logging.md 或 DevOps 文档，避免部署时缺失配置。
