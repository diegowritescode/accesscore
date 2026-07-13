import { type OrgId } from '../../shared/kernel/org-id';
import { type UserId } from '../../shared/kernel/user-id';

export type MembershipStatus = 'active' | 'suspended';

export type MembershipRole = 'owner' | 'member';

export interface Membership {
  id: string;
  userId: UserId;
  orgId: OrgId;
  status: MembershipStatus;
  role: MembershipRole;
  joinedAt: Date;
}
