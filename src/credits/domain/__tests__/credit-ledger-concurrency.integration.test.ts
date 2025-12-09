import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { creditTransaction, userCredit } from '@/db/schema';
import { CreditLedgerRepository } from '@/credits/data-access/credit-ledger-repository';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { CreditLedgerDomainService } from '../credit-ledger-domain-service';

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

describe('CreditLedgerDomainService concurrency', () => {
  it('increments balance atomically under concurrent addCredits calls', async () => {
    try {
      const db = await getDb();
      const repository = new CreditLedgerRepository();
      const domainService = new CreditLedgerDomainService(
        repository,
        async () => db
      );

      const userId = `credits-concurrency-${Date.now()}`;
      const amountPerCall = 1;
      const calls = 20;

      await Promise.all(
        Array.from({ length: calls }).map(() =>
          domainService.addCredits({
            userId,
            amount: amountPerCall,
            type: CREDIT_TRANSACTION_TYPE.MANUAL_ADJUSTMENT,
            description: 'concurrency test',
          })
        )
      );

      const [user] = await db
        .select()
        .from(userCredit)
        .where(eq(userCredit.userId, userId))
        .limit(1);

      expect(user).toBeDefined();
      expect(user?.currentCredits).toBe(amountPerCall * calls);

      const transactions = await db
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.userId, userId));

      expect(transactions.length).toBe(calls);

      const totalAmount = transactions.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );

      expect(totalAmount).toBe(amountPerCall * calls);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message &&
        error.message.includes('ECONNREFUSED')
      ) {
        // eslint-disable-next-line no-console
        console.warn(
          'Skipping CreditLedgerDomainService concurrency test, database is not available',
          error
        );
        return;
      }
      throw error;
    }
  });
});
