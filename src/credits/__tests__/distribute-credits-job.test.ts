import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { PaymentTypes, PlanIntervals } from '@/payment/types';
import { createCreditDistributionServiceStub } from '../../../tests/helpers/credits';

const fetchBatchMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn(async () => ({})));
const runExpirationJobMock = vi.hoisted(() =>
  vi.fn(async () => ({ expiredUsers: 1 }))
);

const mockPlans = [
  {
    id: 'free',
    isFree: true,
    isLifetime: false,
    credits: { enable: true, amount: 5 },
    prices: [],
  },
  {
    id: 'lifetime',
    isFree: false,
    isLifetime: true,
    credits: { enable: true, amount: 50 },
    prices: [
      {
        priceId: 'price_life',
        type: PaymentTypes.SUBSCRIPTION,
        amount: 1000,
        currency: 'usd',
      },
    ],
  },
  {
    id: 'yearly',
    isFree: false,
    isLifetime: false,
    credits: { enable: true, amount: 25 },
    prices: [
      {
        priceId: 'price_year',
        type: PaymentTypes.SUBSCRIPTION,
        amount: 200,
        currency: 'usd',
        interval: PlanIntervals.YEAR,
      },
    ],
  },
  {
    id: 'misconfigured',
    isFree: false,
    isLifetime: false,
    credits: { enable: true, amount: 15 },
    prices: [
      {
        priceId: 'price_invalid',
        type: PaymentTypes.SUBSCRIPTION,
        amount: 300,
        currency: 'usd',
        interval: PlanIntervals.MONTH,
      },
    ],
  },
];

const planByPriceId = new Map(
  mockPlans.flatMap((plan) => plan.prices.map((price) => [price.priceId, plan]))
);

vi.mock('@/db', () => ({ getDb: getDbMock }));
vi.mock('../data-access/user-billing-view', () => ({
  createUserBillingReader: vi.fn(() => ({ fetchBatch: fetchBatchMock })),
}));
vi.mock('../expiry-job', () => ({ runExpirationJob: runExpirationJobMock }));
vi.mock('@/lib/price-plan', () => ({
  getAllPricePlans: vi.fn(() => mockPlans),
  findPlanByPriceId: vi.fn((priceId: string) => planByPriceId.get(priceId)),
}));
vi.mock('@/config/feature-flags', () => ({
  featureFlags: { enableCreditPeriodKey: true },
}));

// eslint-disable-next-line import/first
import { distributeCreditsToAllUsers } from '../distribute';

describe('distributeCreditsToAllUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('distributes credits across free, lifetime, yearly and fallback users', async () => {
    fetchBatchMock
      .mockResolvedValueOnce([
        {
          userId: 'free-1',
          email: null,
          name: null,
          priceId: null,
          paymentStatus: null,
          paymentCreatedAt: null,
        },
        {
          userId: 'lifetime-1',
          email: null,
          name: null,
          priceId: 'price_life',
          paymentStatus: 'active',
          paymentCreatedAt: new Date(),
        },
        {
          userId: 'yearly-1',
          email: null,
          name: null,
          priceId: 'price_year',
          paymentStatus: 'active',
          paymentCreatedAt: new Date(),
        },
        {
          userId: 'misconfigured-1',
          email: null,
          name: null,
          priceId: 'price_invalid',
          paymentStatus: 'active',
          paymentCreatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    const distributionStub = createCreditDistributionServiceStub();

    const result = await distributeCreditsToAllUsers(
      { refDate: new Date('2024-06-15') },
      {
        creditDistributionService: distributionStub.service,
        membershipService: {
          grantLifetimeMembership: vi.fn(),
          findActiveMembershipsByUserIds: vi.fn(async () => []),
        },
      }
    );

    expect(result).toEqual({
      usersCount: 4,
      processedCount: 4,
      errorCount: 0,
    });
    expect(runExpirationJobMock).toHaveBeenCalledTimes(1);
    expect(fetchBatchMock).toHaveBeenCalledTimes(2);

    const executions = distributionStub.getExecutions();
    expect(executions).toHaveLength(3);

    const [freeExecution, lifetimeExecution, yearlyExecution] = executions as [
      (typeof executions)[number],
      (typeof executions)[number],
      (typeof executions)[number],
    ];

    const freeCommands = freeExecution.commands;
    expect(freeCommands).toHaveLength(2);
    expect(freeCommands.map((c) => c.userId)).toEqual(
      expect.arrayContaining(['free-1', 'misconfigured-1'])
    );
    expect(
      freeCommands.every(
        (command) =>
          command.type === CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH &&
          command.periodKey !== undefined &&
          command.description.includes('Free monthly credits')
      )
    ).toBe(true);

    const lifetimeCommands = lifetimeExecution.commands;
    expect(lifetimeCommands).toHaveLength(1);
    expect(lifetimeCommands[0]).toMatchObject({
      userId: 'lifetime-1',
      type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
    });

    const yearlyCommands = yearlyExecution.commands;
    expect(yearlyCommands).toHaveLength(1);
    expect(yearlyCommands[0]).toMatchObject({
      userId: 'yearly-1',
      type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
    });
  });
});
