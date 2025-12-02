---
name: codex-config
description: Codex configuration and rule files
---

# Scope

- Applies only to the `.codex/` directory.

# Rules

- This directory only contains rules, metadata, and tool configuration; no business logic lives here.
- Keep rule files concise and decoupled from specific implementation details where possible.
- When rules conflict with the root `AGENTS.md`, the root file takes precedence.
