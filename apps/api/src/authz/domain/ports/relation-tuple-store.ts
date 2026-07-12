import { type OrgId } from '../../../shared/kernel/org-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type EntityRef } from '../entity-ref';
import { type RelationTuple } from '../relation-tuple';
import { type SubjectRef } from '../subject-ref';

export interface RelationTupleKey {
  readonly orgId: OrgId;
  readonly object: EntityRef;
  readonly relation: string;
  readonly subject: SubjectRef;
}

export interface ObjectRelationQuery {
  readonly orgId: OrgId;
  readonly object: EntityRef;
  readonly relation: string;
}

export interface RelationTupleStore {
  upsert(tuple: RelationTuple, tx?: Tx): Promise<void>;
  delete(key: RelationTupleKey, tx?: Tx): Promise<number>;
  listByObject(query: ObjectRelationQuery): Promise<RelationTuple[]>;
}

export const RELATION_TUPLE_STORE = Symbol('RELATION_TUPLE_STORE');
