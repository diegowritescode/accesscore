import { type OrgId } from '../../../shared/kernel/org-id';
import { type Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type EntityRef } from '../entity-ref';
import { type FlatMember } from '../evaluate';

export interface MembershipSetRef {
  readonly object: EntityRef;
  readonly relation: string;
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
  listOrgsWithNamespaceChanges(after: Revision, upTo: Revision, tx: Tx): Promise<OrgId[]>;
  readCursor(tx?: Tx): Promise<Revision>;
  writeCursor(revision: Revision, tx: Tx): Promise<void>;
}

export const MEMBERSHIP_INDEX_STORE = Symbol('MEMBERSHIP_INDEX_STORE');

export interface MembershipHit {
  readonly set: MembershipSetRef;
  readonly depth: number;
  readonly validAtRevision: Revision;
}

export interface MembershipIndexReader {
  membershipsOf(orgId: OrgId, member: EntityRef, tx: Tx): Promise<MembershipHit[]>;
  organizationVersion(orgId: OrgId, tx: Tx): Promise<Revision>;
}

export const MEMBERSHIP_INDEX_READER = Symbol('MEMBERSHIP_INDEX_READER');
