---
name: domain-layer
description: Domain modeling and business rules
---

This directory inherits all rules from the root `AGENTS.md` and only adds domain-specific constraints.

# Scope

- `src/domain/**`: domain models, value objects, domain services, repository interfaces, etc.

# Rules

- Pure domain logic:
  - Do not import React, Next.js, or UI-related modules.
  - Do not perform IO directly (such as `fs`, `process.env`, `fetch`, or database clients).
- Dependency inversion:
  - Define interfaces and abstractions here; implementations live in infrastructure or adapter layers.
  - Do not import from higher layers such as `src/app`, `src/components`, or `src/payment`.
- Testability:
  - Express business rules via pure functions or domain objects, making unit tests straightforward.
