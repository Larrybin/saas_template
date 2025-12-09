import 'server-only';

import { addCredits, consumeCredits } from '@/credits/credits';
import { InvalidCreditPayloadError } from '@/credits/domain/errors';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getLogger } from '@/lib/server/logger';

export type AdjustUserCreditsDirection = 'increase' | 'decrease';

export type AdjustUserCreditsInput = {
  operatorId: string;
  userId: string;
  amount: number;
  direction: AdjustUserCreditsDirection;
  reason: string;
  correlationId?: string;
};

/**
 * Usecase: 手工调整用户积分（人工加减）
 *
 * - 仅供受控入口（如 admin Action/内部脚本）调用；
 * - 增加积分：通过 addCredits 写入账本，使用 MANUAL_ADJUSTMENT 类型；
 * - 减少积分：通过 consumeCredits 扣减积分，由领域服务负责余额校验；
 * - 始终写入审计日志，包含 operator/user/amount/direction/reason 等。
 */
export async function adjustUserCredits(
  input: AdjustUserCreditsInput
): Promise<void> {
  const { operatorId, userId, amount, direction, reason, correlationId } =
    input;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvalidCreditPayloadError(
      'Manual credits adjustment amount must be a positive number'
    );
  }

  const logger = getLogger({
    span: 'credits.manual-adjustment',
    userId,
  });

  logger.info(
    { operatorId, userId, amount, direction, reason, correlationId },
    'Manual credits adjustment requested'
  );

  if (direction === 'increase') {
    await addCredits({
      userId,
      amount,
      type: CREDIT_TRANSACTION_TYPE.MANUAL_ADJUSTMENT,
      description: reason || `Manual credits increase: ${amount}`,
    });
  } else {
    await consumeCredits({
      userId,
      amount,
      description: reason || `Manual credits decrease: ${amount}`,
    });
  }

  logger.info(
    { operatorId, userId, amount, direction, correlationId },
    'Manual credits adjustment completed'
  );
}
