import { type OrgId } from '../../../shared/kernel/org-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type Policy } from '../policy/policy';

export interface PoliciesRepository {
  upsert(policy: Policy, tx?: Tx): Promise<void>;
  deleteById(orgId: OrgId, id: string, tx?: Tx): Promise<boolean>;
  listByTarget(orgId: OrgId, resourceType: string, action: string, tx?: Tx): Promise<Policy[]>;
}

export const POLICIES_REPOSITORY = Symbol('POLICIES_REPOSITORY');
