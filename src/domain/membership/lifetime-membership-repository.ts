export type LifetimeMembershipRecord = {
  id: string;
  userId: string;
  priceId: string;
  cycleRefDate: Date;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
};

export type MembershipDbExecutor = unknown;

export type UpsertLifetimeMembershipInput = {
  userId: string;
  priceId: string;
  cycleRefDate: Date;
  revokedAt?: Date | null;
};

export interface LifetimeMembershipRepository<
  DbExecutor = MembershipDbExecutor,
> {
  upsertMembership(
    input: UpsertLifetimeMembershipInput,
    db?: DbExecutor
  ): Promise<void>;

  findActiveByUserIds(
    userIds: string[],
    db?: DbExecutor
  ): Promise<LifetimeMembershipRecord[]>;
}
