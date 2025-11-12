# Lifecycle Hooks Sequencing

## Goal
Ensure user lifecycle hooks that mutate shared credit state run sequentially to avoid race conditions introduced by `Promise.allSettled`.

## Tasks
- [ ] Update `UserLifecycleManager.emit` to await handlers sequentially while still logging failures.
- [ ] Add/adjust unit tests verifying hook order is preserved.
- [ ] Run `npx tsc --noEmit` and `pnpm test`.
