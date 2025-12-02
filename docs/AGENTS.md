---
name: docs
description: Documentation directory guidelines
---

This directory inherits all rules from the root `AGENTS.md` and only adds docs-specific constraints.

# Scope

- `docs/**`: architecture docs, lifecycle docs, feature/module guides, testing strategy, and developer workflows.

# Rules

- Source of truth:
  - Code is the ultimate source of truth; docs should describe the current behavior, not prescribe new ones without corresponding code changes.
  - When behavior changes in core domains (Auth, Credits, Billing/Payment, AI, Storage), update the relevant docs (`docs/*-lifecycle.md`, `docs/feature-modules.md`, `docs/testing-strategy.md`, etc.).
- Consistency:
  - Keep terminology consistent with code (error codes, domain names, function/usecase names).
  - When adding new error codes or error UI flows, ensure `docs/error-codes.md` and `docs/error-logging.md` stay in sync with `src/lib/server/error-codes.ts` and domain error utilities.
- Commands in docs:
  - Commands like `pnpm db:migrate`, `pnpm deploy`, and similar are written for human developers.
  - The assistant must not run such commands unless explicitly requested by the user.
