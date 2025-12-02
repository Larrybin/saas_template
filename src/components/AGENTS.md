---
name: ui-components
description: Reusable UI component guidelines
---

This directory inherits all rules from the root `AGENTS.md` and only adds UI-specific constraints.

# Scope

- `src/components/**`: reusable UI components, layout primitives, and visual building blocks.

# Rules

- No business logic:
  - Do not import `src/domain` directly; pass data and values through props.
  - Avoid complex business branching and workflows inside components.
- No side effects:
  - Do not initiate network requests or directly read/write persistence in this directory.
- Reuse first:
  - Extract common interaction and visual patterns here instead of duplicating them in `src/app`.
