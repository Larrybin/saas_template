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

vi.mock('@/lib/price-plan', () => ({
  findPlanByPriceId: vi.fn(),
}));

import { findPlanByPriceId } from '@/lib/price-plan';
import { PlanIntervals, type PricePlan } from '@/payment/types';
import { addCredits, canAddCreditsByType } from '../../credits';
import { CREDIT_TRANSACTION_TYPE } from '../../types';
import {
  CreditDistributionService,
  type PlanUserRecord,
} from '../credit-distribution-service';

const mockedAddCredits = addCredits as unknown as ReturnType<typeof vi.fn>;
const mockedCanAdd = canAddCreditsByType as unknown as ReturnType<typeof vi.fn>;
const mockedFindPlanByPriceId = findPlanByPriceId as unknown as ReturnType<
  typeof vi.fn
>;

describe('CreditDistributionService', () => {
  const service = new CreditDistributionService();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindPlanByPriceId.mockReset();
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
    mockedCanAdd.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
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

  it('generates free commands with period key', () => {
    const commands = service.generateFreeCommands({
      userIds: ['user-1'],
      plan: {
        credits: { enable: true, amount: 25, expireDays: 30 },
      } as PricePlan,
      periodKey: 202502,
      monthLabel: '2025-02',
    });
    expect(commands).toEqual([
      {
        userId: 'user-1',
        type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
        amount: 25,
        description: 'Free monthly credits: 25 for 2025-02',
        expireDays: 30,
        periodKey: 202502,
      },
    ]);
  });

  it('generates lifetime commands using plan lookups', () => {
    const users: PlanUserRecord[] = [{ userId: 'user-1', priceId: 'price-1' }];
    mockedFindPlanByPriceId.mockReturnValue({
      credits: { enable: true, amount: 100, expireDays: 60 },
      isLifetime: true,
      prices: [],
    });
    const commands = service.generateLifetimeCommands({
      users,
      periodKey: 202503,
      monthLabel: '2025-03',
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      periodKey: 202503,
    });
  });

  it('generates yearly commands filtered by interval', () => {
    const users: PlanUserRecord[] = [{ userId: 'user-1', priceId: 'price-1' }];
    mockedFindPlanByPriceId.mockReturnValue({
      credits: { enable: true, amount: 40, expireDays: undefined },
      prices: [
        {
          priceId: 'price-1',
          interval: PlanIntervals.YEAR,
        },
      ],
    });
    const commands = service.generateYearlyCommands({
      users,
      periodKey: 202504,
      monthLabel: '2025-04',
    });
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL);
  });
});
