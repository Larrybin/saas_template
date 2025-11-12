import { getLogger } from '@/lib/server/logger';
import { addCredits, canAddCreditsByType } from '../credits';
import type { AddCreditsPayload } from '../services/credits-gateway';
import type { CommandExecutionResult, CreditCommand } from './credit-command';

export class CreditDistributionService {
  constructor(
    private readonly logger = getLogger({
      span: 'credits.distribution.service',
    })
  ) {}

  async execute(commands: CreditCommand[]): Promise<CommandExecutionResult> {
    const result: CommandExecutionResult = {
      total: commands.length,
      processed: 0,
      skipped: 0,
      errors: [],
    };

    for (const command of commands) {
      try {
        const eligible = await canAddCreditsByType(
          command.userId,
          command.type,
          command.periodKey
        );
        if (!eligible) {
          result.skipped += 1;
          continue;
        }
        const payload: AddCreditsPayload = {
          userId: command.userId,
          amount: command.amount,
          type: command.type,
          description: command.description,
          expireDays: command.expireDays,
          paymentId: command.paymentId,
          periodKey: command.periodKey,
        };
        await addCredits(payload);
        result.processed += 1;
      } catch (error) {
        result.errors.push({
          userId: command.userId,
          type: command.type,
          error,
        });
        this.logger.error(
          { error, userId: command.userId, type: command.type },
          'Failed to execute credit command'
        );
      }
    }

    return result;
  }
}
