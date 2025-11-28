'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { findPlanByPriceId, getAllPricePlans } from '@/lib/price-plan';
import { userActionClient } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { PaymentTypes } from '@/payment/types';

const logger = getLogger({ span: 'actions.get-lifetime-status' });

// Input schema
const schema = z.object({
  userId: z.string().min(1, { error: 'User ID is required' }),
});

/**
 * Get user lifetime membership status directly from the database
 *
 * NOTICE: If you first add lifetime plan and then delete it,
 * the user with lifetime plan should be considered as a lifetime member as well,
 * in order to do this, you have to update the logic to check the lifetime status,
 * for example, just check the planId is `lifetime` or not.
 */
export const getLifetimeStatusAction = userActionClient
  .schema(schema)
  .action(async ({ ctx }) => {
    const currentUser = (ctx as { user: User }).user;
    const userId = currentUser.id;

    try {
      // Get lifetime plans
      const plans = getAllPricePlans();
      const lifetimePlanIds = plans
        .filter((plan) => plan.isLifetime)
        .map((plan) => plan.id);

      // Check if there are any lifetime plans defined in the system
      if (lifetimePlanIds.length === 0) {
        throw new DomainError({
          code: ErrorCodes.UnexpectedError,
          message: 'No lifetime plans defined in the system',
          retryable: false,
        });
      }

      // Query the database for one-time payments with lifetime plans
      const db = await getDb();
      const result = await db
        .select({
          id: payment.id,
          priceId: payment.priceId,
          type: payment.type,
        })
        .from(payment)
        .where(
          and(
            eq(payment.userId, userId),
            eq(payment.type, PaymentTypes.ONE_TIME),
            eq(payment.status, 'completed')
          )
        );

      // Check if any payment has a lifetime plan
      const hasLifetimePayment = result.some((paymentRecord) => {
        const plan = findPlanByPriceId(paymentRecord.priceId);
        return plan && lifetimePlanIds.includes(plan.id);
      });

      return {
        success: true,
        isLifetimeMember: hasLifetimePayment,
      };
    } catch (error) {
      logger.error({ error, userId }, 'get user lifetime status error');
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError({
        code: ErrorCodes.UnexpectedError,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch lifetime status',
        retryable: true,
      });
    }
  });
