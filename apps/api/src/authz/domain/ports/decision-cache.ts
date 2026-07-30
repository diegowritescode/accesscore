import { type OrgId } from '../../../shared/kernel/org-id';
import { type Revision } from '../../../shared/kernel/revision';
import { type Decision } from '../decision';

export interface DecisionCacheKey {
  readonly orgId: OrgId;
  readonly subject: string;
  readonly action: string;
  readonly resource: string;
  readonly revision: Revision;
}

export interface DecisionCache {
  get(key: DecisionCacheKey): Promise<Decision | null>;
  set(key: DecisionCacheKey, decision: Decision): Promise<void>;
}

export const DECISION_CACHE = Symbol('DECISION_CACHE');
