import { getLogger, type LogContext, type Logger } from '@/lib/server/logger';

export type JobLoggerParams = {
  span: string;
  job: string;
  extra?: LogContext;
};

export type JobLoggerResult = {
  logger: Logger;
  jobRunId: string;
};

export function createJobLogger(params: JobLoggerParams): JobLoggerResult {
  const jobRunId = `${params.job}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const logger = getLogger({
    span: params.span,
    job: params.job,
    jobRunId,
    ...(params.extra ?? {}),
  });

  return { logger, jobRunId };
}
