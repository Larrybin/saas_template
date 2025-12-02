# Architecture Overview

## Top-level structure

- `src/app`: Next.js App Router pages and route handlers (API).
- `src/components`: Shared UI components.
- `src/lib`: Cross-cutting libraries (auth, safe actions, domain errors, server usecases, logging).
- `src/credits`: Credits domain (ledger, distribution job, config).
- `src/domain`: Business domains that cross-cut infra (e.g. billing).
- `src/payment`: Payment provider integration and payment domain services.
- `src/db`: Drizzle schema and DB access helpers.
- `src/newsletter`, `src/mail`, `src/notification`: Outbound communication domains.

The general dependency direction is:

`app` (UI / routes) → `lib` / `domain` / `credits` / `payment` → `db` / external providers

## Usecase: AI Chat with Billing & Credits

### High-level flow

1. **API route**: `src/app/api/chat/route.ts`
   - Validates auth via `ensureApiUser`.
   - Enforces rate limit via `enforceRateLimit`.
   - Parses and validates request body with `chatRequestSchema`.
   - Delegates to the usecase `executeAiChatWithBilling`.

2. **Usecase**: `src/lib/server/usecases/execute-ai-chat-with-billing.ts`
   - Orchestrates:
     - Upfront billing / credits checks.
     - Downstream AI provider call.
     - Mapping of provider result to a UI stream response (reasoning + sources).

3. **Domain / infra**
   - Billing / credits rules live in `src/domain/billing` and `src/credits`.
   - Payment provider is accessed through `src/payment`.
   - Logging and rate limiting are centralized under `src/lib/server`.

The route stays thin and focuses on HTTP concerns (auth, rate-limit, request validation, response type), while the usecase encapsulates the business interaction between billing/credits and AI providers.

## Usecase: Credits Distribution Job

### High-level flow

1. **API route**: `src/app/api/distribute-credits/route.ts`
   - 使用 `serverEnv.cronJobs` 中的凭证配置，并通过 `validateInternalJobBasicAuth` 校验 Basic Auth。
   - Only allows triggering the job when credentials match.
   - On success, calls `runCreditsDistributionJob` and returns a JSON envelope:
     ```json
     {
       "success": true,
       "data": {
         "usersCount": number,
         "processedCount": number,
         "errorCount": number
       }
     }
     ```
   - On failure, returns:
     ```json
     {
       "success": false,
       "error": "Distribute credits job failed",
       "code": "CREDITS_DISTRIBUTION_FAILED",
       "retryable": true
     }
     ```

2. **Usecase**: `src/lib/server/usecases/distribute-credits-job.ts`
   - Generates a `jobRunId` for logging and tracing.
   - Logs a “starting” entry with the jobRunId.
   - Calls `distributeCreditsToAllUsers()` from `src/credits/distribute.ts`.
   - Logs a “finished” entry with `{ jobRunId, usersCount, processedCount, errorCount }`.
   - Returns `{ usersCount, processedCount, errorCount }` to the caller; unexpected errors surface as `ErrorCodes.CreditsDistributionFailed`.

3. **Credits distribution domain**: `src/credits/distribute.ts`
   - Orchestrates the core distribution logic:
     - Processes expired credits via `runExpirationJob`.
     - Reads user + payment snapshot using the data-access layer (`createUserBillingReader`).
     - Resolves lifetime memberships and classifies users into:
       - Free users.
       - Lifetime users.
       - Yearly subscription users.
     - Delegates per-segment command generation and execution to `CreditDistributionService`.
   - Uses DB schema from `src/db/schema.ts` and plan configuration from `src/lib/price-plan.ts` and policies under `src/domain/billing`.
   - Auth / envelope expectations for the API route:
     - Missing `CRON_JOBS_USERNAME` / `CRON_JOBS_PASSWORD` → `500` + `CRON_BASIC_AUTH_MISCONFIGURED`.
     - Wrong or missing Basic header → `401` + `AUTH_UNAUTHORIZED`，附带 `WWW-Authenticate: Basic realm="Secure Area"`。
     - Job failure → `500` + `CREDITS_DISTRIBUTION_FAILED`（`retryable: true`）。

The job usecase keeps the API route focused on authentication and HTTP response shape, while centralizing the job orchestration concerns (logging, tracing, and the call into the credits domain) in a reusable server-side entry point that could later be reused by CLI or background worker triggers.

For a complete list of error codes used across APIs and domain services, see `docs/error-codes.md`.  
For a detailed description of the credits lifecycle and domain boundaries, see `docs/credits-lifecycle.md`.  
For a detailed description of the payment lifecycle, Stripe integration and its interaction with credits, see `docs/payment-lifecycle.md`.  
For a detailed description of AI text/chat/image lifecycles and their interaction with credits, see `docs/ai-lifecycle.md`.  
For a detailed description of storage upload/delete lifecycles and provider boundaries, see `docs/storage-lifecycle.md`.  
For developer-oriented guidance and extension patterns, see `docs/developer-guide.md`.
