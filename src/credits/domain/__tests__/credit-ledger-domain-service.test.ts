import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/feature-flags', () => ({
  featureFlags: { enableCreditPeriodKey: true },
}));

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

import type { ICreditLedgerRepository } from '../../data-access/credit-ledger-repository.interface';
import { CreditLedgerDomainService } from '../credit-ledger-domain-service';

describe('CreditLedgerDomainService (period key)', () => {
  const createRepositoryMock = (): ICreditLedgerRepository => ({
    findUserCredit: vi.fn().mockResolvedValue({ currentCredits: 0 }),
    upsertUserCredit: vi.fn().mockResolvedValue(undefined),
    updateUserCredits: vi.fn().mockResolvedValue(undefined),
    insertTransaction: vi.fn().mockResolvedValue(undefined),
    findFifoEligibleTransactions: vi.fn().mockResolvedValue([]),
    updateTransactionRemainingAmount: vi.fn().mockResolvedValue(undefined),
    insertUsageRecord: vi.fn().mockResolvedValue(undefined),
    findExpirableTransactions: vi.fn().mockResolvedValue([]),
    markTransactionExpired: vi.fn().mockResolvedValue(undefined),
  });

  let repository: ICreditLedgerRepository;
  let domainService: CreditLedgerDomainService;

  beforeEach(() => {
    repository = createRepositoryMock();
    domainService = new CreditLedgerDomainService(
      repository,
      async () => ({}) as never
    );
  });

  it('persists provided periodKey when feature flag enabled', async () => {
    await domainService.addCredits({
      userId: 'user-1',
      amount: 25,
      type: 'TEST',
      description: 'Stage B validation',
      periodKey: 202501,
    });

    expect(repository.insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ periodKey: 202501 }),
      expect.anything()
    );
  });
});
