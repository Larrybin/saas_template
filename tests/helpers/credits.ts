import { vi } from 'vitest';
import type {
  CommandExecutionResult,
  CreditCommand,
} from '@/credits/distribution/credit-command';
import {
  CreditDistributionService,
  type PlanUserRecord,
} from '@/credits/distribution/credit-distribution-service';
import type { MembershipService } from '@/domain/membership';
import type { LifetimeMembershipRecord } from '@/domain/membership/lifetime-membership-repository';

type DistributionOverrides = Partial<CommandExecutionResult>;

type ExecutionRecord = {
  commands: CreditCommand[];
  executorProvided: boolean;
};

export function createCreditDistributionServiceStub(
  overrides: DistributionOverrides = {}
) {
  const baseService = new CreditDistributionService();
  const executions: ExecutionRecord[] = [];
  const execute = vi.fn(
    async (
      commands: CreditCommand[],
      executor?: unknown
    ): Promise<CommandExecutionResult> => {
      executions.push({ commands, executorProvided: Boolean(executor) });
      return {
        total: commands.length,
        processed: commands.length,
        skipped: 0,
        errors: [],
        flagEnabled: true,
        ...overrides,
      };
    }
  );

  const service = Object.assign(baseService, {
    execute,
  }) as CreditDistributionService;

  return {
    service,
    execute,
    getExecutions(): ExecutionRecord[] {
      return executions;
    },
  };
}

export function createMembershipServiceStub(
  memberships: Record<string, LifetimeMembershipRecord[]> = {}
): MembershipService {
  return {
    grantLifetimeMembership: vi.fn(),
    findActiveMembershipsByUserIds: vi.fn(async (userIds: string[]) =>
      userIds.flatMap(
        (userId) => memberships[userId]?.map((record) => ({ ...record })) ?? []
      )
    ),
  };
}

export function createPlanUserRecord(
  userId: string,
  priceId: string
): PlanUserRecord {
  return { userId, priceId };
}
