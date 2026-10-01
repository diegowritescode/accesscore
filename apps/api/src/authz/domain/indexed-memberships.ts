import { type EntityRef, formatEntityRef } from './entity-ref';

export interface IndexedMembership {
  readonly object: EntityRef;
  readonly relation: string;
  readonly depth: number;
}

export class IndexedMemberships {
  static readonly none = new IndexedMemberships(null, new Map());

  private constructor(
    private readonly member: string | null,
    private readonly depths: ReadonlyMap<string, number>,
  ) {}

  static of(member: EntityRef, memberships: Iterable<IndexedMembership>): IndexedMemberships {
    const depths = new Map<string, number>();
    for (const membership of memberships) {
      const key = `${formatEntityRef(membership.object)}#${membership.relation}`;
      const seen = depths.get(key);
      if (seen === undefined || membership.depth < seen) {
        depths.set(key, membership.depth);
      }
    }
    return new IndexedMemberships(formatEntityRef(member), depths);
  }

  depthOf(object: EntityRef, relation: string, member: EntityRef): number | null {
    if (this.member !== formatEntityRef(member)) {
      return null;
    }
    return this.depths.get(`${formatEntityRef(object)}#${relation}`) ?? null;
  }
}
