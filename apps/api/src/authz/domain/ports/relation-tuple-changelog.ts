import { type OrgId } from '../../../shared/kernel/org-id';
import { type Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type EntityRef } from '../entity-ref';
import { type SubjectRef } from '../subject-ref';

export type TupleChangeOp = 'upsert' | 'delete';

export interface TupleChange {
  readonly orgId: OrgId;
  readonly revision: Revision;
  readonly op: TupleChangeOp;
  readonly object: EntityRef;
  readonly relation: string;
  readonly subject: SubjectRef;
  readonly recordedAt: Date;
}

export interface TupleChangeQuery {
  readonly orgId: OrgId;
  readonly afterRevision: Revision;
  readonly limit: number;
}

export interface RelationTupleChangelog {
  append(change: TupleChange, tx: Tx): Promise<void>;
  since(query: TupleChangeQuery, tx?: Tx): Promise<TupleChange[]>;
}

export const RELATION_TUPLE_CHANGELOG = Symbol('RELATION_TUPLE_CHANGELOG');
