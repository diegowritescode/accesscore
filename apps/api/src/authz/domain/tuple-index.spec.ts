import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type EntityRef } from './entity-ref';
import { RelationTuple } from './relation-tuple';
import { type SubjectRef } from './subject-ref';
import { TupleIndex } from './tuple-index';

describe('TupleIndex', () => {
  const orgA = OrgId.generate();
  const orgB = OrgId.generate();
  const object: EntityRef = { type: 'document', id: 'doc-1' };
  const alice: SubjectRef = { kind: 'subject', ref: { type: 'user', id: 'alice' } };
  const now = new Date('2026-07-12T00:00:00.000Z');

  const tuple = (orgId: OrgId, subject: SubjectRef): RelationTuple =>
    RelationTuple.write({
      orgId,
      object,
      relation: 'viewer',
      subject,
      revision: Revision.fromValue(0),
      createdAt: now,
    });

  it('indexes subjects by object and relation for its org', () => {
    const index = TupleIndex.of(orgA, [tuple(orgA, alice)]);
    expect(index.subjectsOf(object, 'viewer')).toEqual([alice]);
  });

  it('returns an empty list for an unknown node', () => {
    const index = TupleIndex.of(orgA, [tuple(orgA, alice)]);
    expect(index.subjectsOf(object, 'editor')).toEqual([]);
    expect(index.subjectsOf({ type: 'folder', id: 'f1' }, 'viewer')).toEqual([]);
  });

  it('drops tuples from other orgs at build time', () => {
    const index = TupleIndex.of(orgA, [tuple(orgB, alice)]);
    expect(index.orgId).toBe(orgA);
    expect(index.subjectsOf(object, 'viewer')).toEqual([]);
  });
});
