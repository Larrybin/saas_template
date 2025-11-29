import type { CreditsTransaction } from '@/credits/services/transaction-context';
import { resolveExecutor } from '@/credits/services/transaction-context';
import type {
  LifetimeMembershipRecord,
  LifetimeMembershipRepository,
  MembershipDbExecutor,
} from './lifetime-membership-repository';

export interface MembershipService {
  grantLifetimeMembership(input: {
    userId: string;
    priceId: string;
    cycleRefDate?: Date;
    transaction?: CreditsTransaction;
  }): Promise<void>;

  findActiveMembershipsByUserIds(
    userIds: string[],
    db?: MembershipDbExecutor
  ): Promise<LifetimeMembershipRecord[]>;
}

export class DefaultMembershipService implements MembershipService {
  private readonly repository: LifetimeMembershipRepository<MembershipDbExecutor>;

  constructor(repository: LifetimeMembershipRepository<MembershipDbExecutor>) {
    this.repository = repository;
  }

  async grantLifetimeMembership(input: {
    userId: string;
    priceId: string;
    cycleRefDate?: Date;
    transaction?: CreditsTransaction;
  }): Promise<void> {
    const refDate = input.cycleRefDate ?? new Date();
    const executor = resolveExecutor(input.transaction);

    await this.repository.upsertMembership(
      {
        userId: input.userId,
        priceId: input.priceId,
        cycleRefDate: refDate,
      },
      executor
    );
  }

  async findActiveMembershipsByUserIds(
    userIds: string[],
    db?: MembershipDbExecutor
  ): Promise<LifetimeMembershipRecord[]> {
    return await this.repository.findActiveByUserIds(userIds, db);
  }
}
