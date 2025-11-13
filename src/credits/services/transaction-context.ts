export class CreditsTransaction {
  constructor(private readonly executor: unknown) {}

  unwrap<TExecutor>(): TExecutor {
    return this.executor as TExecutor;
  }
}

export function createCreditsTransaction(executor: unknown) {
  return new CreditsTransaction(executor);
}

export function resolveExecutor<TExecutor>(
  tx?: CreditsTransaction
): TExecutor | undefined {
  return tx ? tx.unwrap<TExecutor>() : undefined;
}
