import { describe, expect, it, vi } from 'vitest';

import { consumeCreditsAction } from '@/actions/consume-credits';
import { consumeCredits } from '@/credits/credits';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/safe-action', () => ({
  userActionClient: {
    schema: () => ({
      // In tests, expose the raw implementation instead of safe-action wrapper
      action: (impl: unknown) => impl,
    }),
  },
}));

vi.mock('@/credits/credits', () => ({
  consumeCredits: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe('consumeCreditsAction DomainError behavior', () => {
  const user = { id: 'user_1' } as User;

  it('consumes credits successfully', async () => {
    (consumeCredits as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const result = await consumeCreditsAction({
      parsedInput: { amount: 10, description: 'test' },
      ctx: { user },
    } as never);

    expect(result).toEqual({ success: true });
    expect(consumeCredits).toHaveBeenCalledWith({
      userId: user.id,
      amount: 10,
      description: 'test',
    });
  });

  it('rethrows DomainError from consumeCredits', async () => {
    (consumeCredits as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DomainError({
        code: ErrorCodes.CreditsInsufficientBalance,
        message: 'insufficient',
        retryable: false,
      })
    );

    await expect(
      consumeCreditsAction({
        parsedInput: { amount: 10 },
        ctx: { user },
      } as never)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.CreditsInsufficientBalance,
      retryable: false,
    });
  });

  it('wraps unexpected errors into UnexpectedError DomainError', async () => {
    (consumeCredits as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('unexpected')
    );

    await expect(
      consumeCreditsAction({
        parsedInput: { amount: 5 },
        ctx: { user },
      } as never)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.UnexpectedError,
    });
  });
});
