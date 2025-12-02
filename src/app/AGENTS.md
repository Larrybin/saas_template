---
name: app-layer
description: Next.js application layer guidelines
---

This directory inherits all rules from the root `AGENTS.md` and only adds app-layer constraints.

# Scope

- `src/app/**`: routes, layouts, page-level container components, and server-side logic.

# Rules

- Component types:
  - Prefer React Server Components by default.
  - Use `use client` only when browser capabilities are required.
- Responsibility boundaries:
  - Routes/pages focus on composing UI and orchestrating domain services.
  - Core business logic should be imported from `src/domain` or `src/lib`, not embedded directly inside JSX.
- Infrastructure access:
  - When accessing databases or APIs, go through the project's data access abstractions (e.g., repositories/services).
  - Avoid scattering ad-hoc `fetch` calls with business branching inside components.
