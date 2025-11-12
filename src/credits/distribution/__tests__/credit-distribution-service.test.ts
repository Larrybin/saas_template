import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../credits', () => ({
  addCredits: vi.fn(),
  canAddCreditsByType: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    child: () => ({
      error: vi.fn(),
      info: vi.fn(),
    }),
  }),
}));

import { addCredits, canAddCreditsByType } from '../../credits';
import { CreditDistributionService } from '../credit-distribution-service';

const mockedAddCredits = addCredits as unknown as ReturnType<typeof vi.fn>;
const mockedCanAdd = canAddCreditsByType as unknown as ReturnType<typeof vi.fn>;

describe('CreditDistributionService', () => {
  const service = new CreditDistributionService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes eligible commands', async () => {
    mockedCanAdd.mockResolvedValue(true);
    mockedAddCredits.mockResolvedValue(undefined);

    const result = await service.execute([
      {
        userId: 'user-1',
        type: 'TEST',
        amount: 10,
        description: 'command-1',
        periodKey: 202501,
      },
      {
        userId: 'user-2',
        type: 'TEST',
        amount: 15,
        description: 'command-2',
        periodKey: 202501,
      },
    ]);

    expect(result.processed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mockedAddCredits).toHaveBeenCalledTimes(2);
  });

  it('skips ineligible commands and collects errors', async () => {
    mockedCanAdd
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mockedAddCredits.mockRejectedValueOnce(new Error('db error'));

    const result = await service.execute([
      {
        userId: 'user-1',
        type: 'TEST',
        amount: 10,
        description: 'first',
      },
      {
        userId: 'user-2',
        type: 'TEST',
        amount: 20,
        description: 'second',
      },
    ]);

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});
