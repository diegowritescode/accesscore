import { type OrgId } from '../../shared/kernel/org-id';
import { type Action } from './action';
import { type EntityRef } from './entity-ref';

export interface AuthorizationQuery {
  readonly orgId: OrgId;
  readonly subject: EntityRef;
  readonly action: Action;
  readonly resource: EntityRef;
}
