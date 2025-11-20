import type { DbExecutor } from '../data-access/types';

/**
 * Lightweight transaction wrapper used by CreditsGateway callers
 * to pass an existing database executor without leaking its concrete type.
 */
export class CreditsTransaction {
  constructor(private readonly executor: DbExecutor) {}

  unwrap(): DbExecutor {
    return this.executor;
  }
}

export function createCreditsTransaction(executor: DbExecutor) {
  return new CreditsTransaction(executor);
}

export function resolveExecutor(
  tx?: CreditsTransaction
): DbExecutor | undefined {
  return tx ? tx.unwrap() : undefined;
}
