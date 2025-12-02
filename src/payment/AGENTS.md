---
name: payment
description: Payment and billing safety guidelines
---

This directory inherits all rules from the root `AGENTS.md` and only adds payment-specific constraints.

# Scope

- `src/payment/**`: payment services, adapters, webhook handlers, and billing-related orchestration.

# Rules

- Security and compliance:
  - Never log or persist full card numbers, CVV, or other sensitive payment details.
  - Operate on tokens or masked data; raw secrets should only live in provider SDKs and env configuration.
- Money handling:
  - Represent monetary amounts using integer minor units (e.g., cents) or a dedicated Money type, not floating point.
  - All conversions between display values and stored values must be explicit and test-covered.
- External services:
  - Centralize direct Stripe (or other provider) SDK usage in adapter modules; business logic should depend on Like/DTO types instead of full SDK types.
  - Explicitly handle timeouts, network errors, idempotency, and retry behavior for webhooks and checkout flows.
- Idempotency and consistency:
  - Webhook handlers must be idempotent (safe on retry) and guard against duplicate sessions/events.
  - When coordinating with Credits/Billing, prefer transactional repositories and in-memory fakes in tests, as described in `docs/payment-lifecycle.md`.
