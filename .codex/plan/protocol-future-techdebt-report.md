# 协议 / 未来演进 / 技术债 审查报告

## 1. 协议（Protocol）检查

### 1.1 覆盖现状
- `docs/api-reference.md:3` 明确声明 `/api/*` 与 Server Action 的统一 Envelope、鉴权与速率限制，代码层由 `ensureApiUser`、`enforceRateLimit`、`userActionClient/adminActionClient` 负责落实。
- 核心 API（Chat/Analyze/Image/Storage/Webhook/Cron/Search）在 `src/app/api` 下有独立 Route，均附带 request logger。Webhook 入口 `src/app/api/webhooks/stripe/route.ts:14` 以 DomainError 捕获 Stripe 事件异常，并根据 `PaymentSecurityViolation` 选择状态码。
- Server Action 列表与权限模型在 `docs/api-reference.md` 的 Action 表与 `src/actions/*` 一一对应（如 `createPortalAction`），并由 `src/lib/safe-action.ts` 统一注入 `code` 与 `retryable` 字段。
- 内部 Job 触发协议在 `docs/env-and-ops.md:76` 记录了 Basic Auth、防护策略、日志要求；实现位于 `src/app/api/distribute-credits/route.ts`。

### 1.2 风险与缺口
1. **搜索 API 未对齐统一 Envelope**  
   - 文档在 `docs/error-logging.md:344` 已将 `/api/search` 标记为“⚠️ 待复查”，但实现 `src/app/api/search/route.ts:71` 直接透传 `searchAPI.GET(request)`，缺少 `{ success, error, code }` 包裹与标准化错误码。当前前端如果依赖统一 envelope 会出现解析差异，且日志无法捕获失败上下文。  
   - 建议：包裹 Fumadocs 响应，失败时转成 `UNEXPECTED_ERROR` 或更细粒度 code。

2. **积分分发 API 的未授权响应不是 JSON**  
   - `docs/api-reference.md:6` 要求（除 Chat 流式外）所有接口都用统一 envelope。但 `src/app/api/distribute-credits/route.ts:25` 在 Basic Auth 失败时返回 `NextResponse('Unauthorized', 401)`，导致调用方无法根据 `code` 区分凭证缺失/配置错误等情况，也无法经过 `DomainError` 处理链。  
   - 建议：与其他分支一致返回 `{ success: false, error, code: 'AUTH_UNAUTHORIZED', retryable: false }`。

3. **部分 Server Action 返回 `success: false` 时缺少 `code`**  
   - `subscribeNewsletterAction` (`src/actions/subscribe-newsletter.ts:25`) 和 `validateCaptchaAction` 等直接返回 `{ success: false, error }`，绕过了 `DomainError`/`ErrorCodes`。前端无法复用 `domain-error-ui-registry` 的行为分发，与 `docs/error-logging.md` “错误码与 UI 策略”约定不符。  
   - 建议：将业务分支改为抛出 DomainError（或至少补充 `code`），并同步更新 `docs/error-codes.md`。

## 2. 未来演进评估

1. **Usecase 分层支撑扩展，但配置仍是静态常量**  
   - `executeAiChatWithBilling` / `analyzeWebContentWithCredits` / `generateImageWithCredits` 均集中在 `src/lib/server/usecases/*`，通过 `incrementAiUsageAndCheckWithinFreeQuota`、`consumeCredits` 等编排，保证 API Route 只负责 HTTP 细节。结构良好，适合继续添加新的 AI/积分耦合用例。  
   - 但计费规则由硬编码的 `src/ai/billing-config.ts:10` 提供，缺乏 plan/region 维度，也无法按环境热更新。扩展新产品线或做 A/B 试验需要重新部署。后续可将配置抽象成 `BillingRuleRepository` 或读取 `websiteConfig`/数据库。

2. **Payment 适配器耦合环境常量，不利于多实例或多 Provider**  
   - `StripePaymentService` 在构造函数 (`src/payment/services/stripe-payment-service.ts:148`) 中直接读取 `serverEnv` 并创建 `Stripe`, `CreditLedgerService`, `DefaultBillingService` 等多个依赖。要接入第二个支付通道或做多租户（不同 Stripe key）必须 fork 整个类。  
   - 建议：引入工厂或配置层（如 `PaymentProviderFactory`）接管实例化逻辑，并允许按租户注入 `stripeClient`/`creditsGateway`。

3. **内容 Source 的 TODO 暗示营销页多语言路由存在隐患**  
   - `src/lib/source.ts:54` 留有 “TODO: how to set the baseUrl for pages?”，意味着 pagesSource 可能无法正确生成链接（例如 `/[locale]/pages/*` 与 `/pages/*` 的映射）。若未来增加新的文档集合或拆分 marketing site，建议优先验证该 Source 并补充 e2e 覆盖。

4. **安全/协议一致性仍需系统化监控**  
   - 目前靠 `docs/error-logging.md:112` 的手工表维护 API 与 span 对应关系，没有自动校验。可考虑编写脚本扫描 `src/app/api` 与 `docs/error-logging.md`，自动同步 envelope 合规状态，并在 CI 中阻止新增未对齐的 Route。

## 3. 技术债待办（可量化）

| 问题 | 证据 | 优先级 | 估算 | 备注 |
| --- | --- | --- | --- | --- |
| `/api/search` 未返回统一 envelope，文档也标记为⚠️ | `docs/error-logging.md:344`、`src/app/api/search/route.ts:71` | P1 | 1 人日 | 需决定 fallback code（建议 `UNEXPECTED_ERROR`）并补充测试 |
| `/api/distribute-credits` 的 401 响应非 JSON | `src/app/api/distribute-credits/route.ts:25` | P1 | 0.5 人日 | 改为 JSON envelope，同时更新 `docs/api-reference.md` 示例 |
| Server Action 缺少 `code`，无法复用错误 UI 策略 | `src/actions/*` | P1 | 1.5 人日 | **已在 `src/actions` 范围内完成治理：所有 Server Actions 错误均通过 DomainError + ErrorCodes 返回标准 envelope；后续新增 Action 必须遵循 `.codex/rules/error-handling-and-fallbacks-best-practices.md` 的 Server Action 约束。** |
| AI 计费配置为常量，无法 per-plan 调整 | `src/ai/billing-config.ts:10` | P2 | 2 人日 | 引入配置存储（例如 `websiteConfig` + override），并在计划文档中说明 |
| `pagesSource` baseUrl TODO 未解决，营销页路由风险 | `src/lib/source.ts:54` | P2 | 1 人日 | 明确 pages 的真实路由前缀，必要时为每种语言生成动态 baseUrl |
| 支付服务强耦合单一 Stripe 凭证，阻塞多实例/多 Provider | `src/payment/services/stripe-payment-service.ts:148` | P2 | 3 人日 | 抽象 `PaymentProviderFactory` 并允许按租户注入配置 |

> 优先级定义：P0（立即影响线上）、P1（短期内需修复）、P2（中期优化项）。估算为粗略人日。

## 4. 建议的下一步
1. 先完成两项 P1：统一 `/api/search` 与 `/api/distribute-credits` 响应格式；编写回归测试（API Route test）。
2. 针对 `src/actions` 整理错误码与 UI 策略 mapping，保证文档、`domain-error-ui-registry`、i18n 同步。
3. 讨论 AI 计费与 Payment 实例化的配置策略，为后续多计划/多支付提供扩展接口，并更新文档（`docs/feature-modules.md`、`docs/payment-lifecycle.md`）。
