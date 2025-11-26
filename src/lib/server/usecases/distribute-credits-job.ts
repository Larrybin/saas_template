import { distributeCreditsToAllUsers } from '@/credits/distribute';
import { createJobLogger } from '@/lib/server/job-logger';

export type CreditsDistributionJobResult = {
  usersCount: number;
  processedCount: number;
  errorCount: number;
};

export async function runCreditsDistributionJob(): Promise<CreditsDistributionJobResult> {
  const { logger, jobRunId } = createJobLogger({
    span: 'usecase.credits.distribute',
    job: 'credits.distribute',
  });

  logger.info({ jobRunId }, 'Starting credits distribution job');

  const result = await distributeCreditsToAllUsers();

  logger.info(
    {
      jobRunId,
      ...result,
    },
    'Finished credits distribution job'
  );

  return result;
}
