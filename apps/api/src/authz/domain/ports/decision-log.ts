import { type OrgId } from '../../../shared/kernel/org-id';
import { type Revision } from '../../../shared/kernel/revision';
import { type Effect, type Reason } from '../decision';

export interface DecisionLogRecord {
  readonly id: string;
  readonly orgId: OrgId | null;
  readonly subject: string;
  readonly action: string;
  readonly resource: string;
  readonly effect: Effect;
  readonly reasons: readonly Reason[];
  readonly revisionUsed: Revision;
  readonly latencyMs: number;
  readonly createdAt: Date;
}

export interface DecisionLog {
  record(entry: DecisionLogRecord): Promise<void>;
}

export const DECISION_LOG = Symbol('DECISION_LOG');
