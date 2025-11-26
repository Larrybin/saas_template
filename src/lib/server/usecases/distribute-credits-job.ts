import { distributeCreditsToAllUsers } from '@/credits/distribute';
import { getLogger } from '@/lib/server/logger';

export type CreditsDistributionJobResult = {
  usersCount: number;
  processedCount: number;
  errorCount: number;
};

export async function runCreditsDistributionJob(): Promise<CreditsDistributionJobResult> {
  const logger = getLogger({
    span: 'usecase.credits.distribute',
  });

  logger.info('Starting credits distribution job');

  const result = await distributeCreditsToAllUsers();

  logger.info(
    {
      ...result,
    },
    'Finished credits distribution job'
  );

  return result;
}
