import { type OrgId } from '../../../shared/kernel/org-id';
import { type Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type EntityRef } from '../entity-ref';
import { type FlatMember } from '../evaluate';

export interface MembershipSetRef {
  readonly object: EntityRef;
  readonly relation: string;
}

export interface MaterializedSet {
  readonly set: MembershipSetRef;
  readonly validAtRevision: Revision;
  readonly members: readonly FlatMember[];
}

export interface MembershipIndexStore {
  tryLock(tx: Tx): Promise<boolean>;
  replace(
    orgId: OrgId,
    set: MembershipSetRef,
    members: readonly FlatMember[],
    validAt: Revision,
    tx: Tx,
  ): Promise<void>;
  remove(orgId: OrgId, set: MembershipSetRef, tx: Tx): Promise<void>;
  listSets(orgId: OrgId, tx?: Tx): Promise<MembershipSetRef[]>;
  load(orgId: OrgId, sets: readonly MembershipSetRef[], tx?: Tx): Promise<MaterializedSet[]>;
  readCursor(tx?: Tx): Promise<Revision>;
  writeCursor(revision: Revision, tx: Tx): Promise<void>;
}

export const MEMBERSHIP_INDEX_STORE = Symbol('MEMBERSHIP_INDEX_STORE');
