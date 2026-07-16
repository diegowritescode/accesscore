import { type OrgId } from '../../../shared/kernel/org-id';
import { type Revision } from '../../../shared/kernel/revision';
import { type Condition } from './condition';

export type PolicyEffect = 'permit' | 'forbid';

export const ANY_ACTION = '*';

export interface Policy {
  readonly id: string;
  readonly orgId: OrgId;
  readonly effect: PolicyEffect;
  readonly resourceType: string;
  readonly action: string;
  readonly condition: Condition;
  readonly revision: Revision;
}
