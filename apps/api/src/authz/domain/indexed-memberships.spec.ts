import { type EntityRef } from './entity-ref';
import { IndexedMemberships } from './indexed-memberships';

const alice: EntityRef = { type: 'user', id: 'alice' };
const bob: EntityRef = { type: 'user', id: 'bob' };
const eng: EntityRef = { type: 'group', id: 'eng' };

describe('IndexedMemberships', () => {
  it('reports the depth of an indexed membership', () => {
    const view = IndexedMemberships.of(alice, [{ object: eng, relation: 'member', depth: 2 }]);

    expect(view.depthOf(eng, 'member', alice)).toBe(2);
  });

  it('keeps the shallowest depth when a set is listed twice', () => {
    const view = IndexedMemberships.of(alice, [
      { object: eng, relation: 'member', depth: 3 },
      { object: eng, relation: 'member', depth: 1 },
    ]);

    expect(view.depthOf(eng, 'member', alice)).toBe(1);
  });

  it('answers nothing for another relation, set, or member', () => {
    const view = IndexedMemberships.of(alice, [{ object: eng, relation: 'member', depth: 0 }]);

    expect(view.depthOf(eng, 'admin', alice)).toBeNull();
    expect(view.depthOf({ type: 'group', id: 'ops' }, 'member', alice)).toBeNull();
    expect(view.depthOf(eng, 'member', bob)).toBeNull();
  });

  it('answers nothing when empty', () => {
    expect(IndexedMemberships.none.depthOf(eng, 'member', alice)).toBeNull();
  });
});
