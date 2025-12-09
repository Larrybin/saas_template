import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';

const addCreditsMock = vi.fn();
const consumeCreditsMock = vi.fn();

vi.mock('@/credits/credits', () => ({
  addCredits: (...args: unknown[]) => addCreditsMock(...args),
  consumeCredits: (...args: unknown[]) => consumeCreditsMock(...args),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { adjustUserCredits } from '../adjust-user-credits';

describe('adjustUserCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increases credits via addCredits with MANUAL_ADJUSTMENT type', async () => {
    await adjustUserCredits({
      operatorId: 'admin-1',
      userId: 'user-1',
      amount: 10,
      direction: 'increase',
      reason: 'Manual top-up',
    });

    expect(addCreditsMock).toHaveBeenCalledTimes(1);
    expect(addCreditsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 10,
      type: CREDIT_TRANSACTION_TYPE.MANUAL_ADJUSTMENT,
      description: 'Manual top-up',
    });
    expect(consumeCreditsMock).not.toHaveBeenCalled();
  });

  it('decreases credits via consumeCredits', async () => {
    await adjustUserCredits({
      operatorId: 'admin-1',
      userId: 'user-1',
      amount: 5,
      direction: 'decrease',
      reason: 'Correction',
    });

    expect(consumeCreditsMock).toHaveBeenCalledTimes(1);
    expect(consumeCreditsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 5,
      description: 'Correction',
    });
    expect(addCreditsMock).not.toHaveBeenCalled();
  });

  it('rejects non-positive amount', async () => {
    await expect(
      adjustUserCredits({
        operatorId: 'admin-1',
        userId: 'user-1',
        amount: 0,
        direction: 'increase',
        reason: 'Invalid',
      })
    ).rejects.toThrow('Manual credits adjustment amount must be a positive');
  });
});
