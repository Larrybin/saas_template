import type {
  LifetimeMembershipRepository,
  MembershipDbExecutor,
  MembershipService,
} from '@/domain/membership';
import { DefaultMembershipService } from '@/domain/membership';
import { UserLifetimeMembershipRepository } from '@/payment/data-access/user-lifetime-membership-repository';

type MembershipServiceFactoryOverrides = {
  membershipRepository?: LifetimeMembershipRepository<MembershipDbExecutor>;
};

let membershipServiceInstance: MembershipService | null = null;

export const createMembershipService = (
  overrides: MembershipServiceFactoryOverrides = {}
): MembershipService => {
  const membershipRepository =
    overrides.membershipRepository ?? new UserLifetimeMembershipRepository();

  return new DefaultMembershipService(membershipRepository);
};

export const getMembershipService = (
  overrides?: MembershipServiceFactoryOverrides
): MembershipService => {
  if (overrides) {
    return createMembershipService(overrides);
  }
  if (!membershipServiceInstance) {
    membershipServiceInstance = createMembershipService();
  }
  return membershipServiceInstance;
};
