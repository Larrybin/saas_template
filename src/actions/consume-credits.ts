'use server';

import { z } from 'zod';
import { consumeCredits } from '@/credits/credits';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';

// consume credits schema
const consumeSchema = z.object({
  amount: z.number().min(1),
  description: z.string().optional(),
});

/**
 * Consume credits
 */
export const consumeCreditsAction = userActionClient
  .schema(consumeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { amount, description } = parsedInput;
    const currentUser = (ctx as { user: User }).user;

    await consumeCredits({
      userId: currentUser.id,
      amount,
      description: description || `Consume credits: ${amount}`,
    });
    return { success: true };
  });
