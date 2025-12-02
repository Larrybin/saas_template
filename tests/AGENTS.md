---
name: tests
description: Test code guidelines
---

This directory inherits all rules from the root `AGENTS.md` and only adds testing-specific constraints.

# Scope

- `tests/**` and test files such as `*.test.ts` / `*.test.tsx` across the repo.

# Rules

- Testing strategy:
  - Follow the high-level approach in `docs/testing-strategy.md`.
  - For more detailed best practices, see `.codex/rules/testing-strategy-best-practices.md`.
- Isolation and determinism:
  - Prefer mocks/fixtures over real external services.
  - Tests should be repeatable and deterministic.
