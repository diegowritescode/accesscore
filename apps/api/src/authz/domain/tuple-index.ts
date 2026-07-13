import { type OrgId } from '../../shared/kernel/org-id';
import { type EntityRef, formatEntityRef } from './entity-ref';
import { type RelationTuple } from './relation-tuple';
import { type SubjectRef } from './subject-ref';

function nodeKey(object: EntityRef, relation: string): string {
  return `${formatEntityRef(object)}#${relation}`;
}

export class TupleIndex {
  private constructor(
    readonly orgId: OrgId,
    private readonly bySubjectNode: ReadonlyMap<string, readonly SubjectRef[]>,
  ) {}

  static of(orgId: OrgId, tuples: readonly RelationTuple[]): TupleIndex {
    const map = new Map<string, SubjectRef[]>();
    for (const tuple of tuples) {
      if (!tuple.orgId.equals(orgId)) {
        continue;
      }
      const key = nodeKey(tuple.object, tuple.relation);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(tuple.subject);
      } else {
        map.set(key, [tuple.subject]);
      }
    }
    return new TupleIndex(orgId, map);
  }

  subjectsOf(object: EntityRef, relation: string): readonly SubjectRef[] {
    return this.bySubjectNode.get(nodeKey(object, relation)) ?? [];
  }
}
