import { type OrgId } from '../../../shared/kernel/org-id';
import { type UserId } from '../../../shared/kernel/user-id';
import { type MembershipRole } from '../membership';

export interface OrgRoleReader {
  roleOf(userId: UserId, orgId: OrgId): Promise<MembershipRole | null>;
}

export const ORG_ROLE_READER = Symbol('ORG_ROLE_READER');
