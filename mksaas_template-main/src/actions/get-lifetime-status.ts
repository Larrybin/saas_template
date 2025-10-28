'use server';

import { getDb } from '@/db';
import { payment } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { findPlanByPriceId, getAllPricePlans } from '@/lib/price-plan';
import { userActionClient } from '@/lib/safe-action';
import { PaymentTypes } from '@/payment/types';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

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
        return {
          success: false,
          error: 'No lifetime plans defined in the system',
        };
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
      console.error('get user lifetime status error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
