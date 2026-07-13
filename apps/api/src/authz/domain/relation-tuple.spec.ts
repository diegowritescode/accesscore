import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { RelationTuple } from './relation-tuple';
import { type SubjectRef } from './subject-ref';

describe('RelationTuple', () => {
  const orgId = OrgId.generate();
  const object = { type: 'document', id: 'doc-1' };
  const subject: SubjectRef = { kind: 'subject', ref: { type: 'user', id: 'alice' } };
  const createdAt = new Date('2026-07-12T00:00:00.000Z');

  it('carries the revision it was written at and exposes its parts', () => {
    const tuple = RelationTuple.write({
      orgId,
      object,
      relation: 'viewer',
      subject,
      revision: Revision.fromValue(7),
      createdAt,
    });

    expect(tuple.orgId.value).toBe(orgId.value);
    expect(tuple.object).toEqual(object);
    expect(tuple.relation).toBe('viewer');
    expect(tuple.subject).toEqual(subject);
    expect(tuple.revision.value).toBe(7);
    expect(tuple.createdAt).toEqual(createdAt);
  });

  it('renders its canonical key for direct and userset subjects', () => {
    const base = {
      orgId,
      object,
      relation: 'viewer',
      revision: Revision.fromValue(1),
      createdAt,
    };

    expect(RelationTuple.write({ ...base, subject }).key()).toBe(
      'document:doc-1#viewer@user:alice',
    );
    expect(
      RelationTuple.write({
        ...base,
        subject: { kind: 'userset', ref: { type: 'group', id: 'eng' }, relation: 'member' },
      }).key(),
    ).toBe('document:doc-1#viewer@group:eng#member');
  });

  it('rejects writing a tuple with unsafe references (delimiter smuggling)', () => {
    const base = { orgId, relation: 'viewer', revision: Revision.fromValue(1), createdAt };

    expect(() =>
      RelationTuple.write({ ...base, object: { type: 'not a namespace', id: 'x' }, subject }),
    ).toThrow();
    expect(() =>
      RelationTuple.write({ ...base, object: { type: 'document', id: 'a#b' }, subject }),
    ).toThrow();
    expect(() =>
      RelationTuple.write({
        ...base,
        object,
        subject: { kind: 'subject', ref: { type: 'user', id: 'a@b' } },
      }),
    ).toThrow();
    expect(() =>
      RelationTuple.write({ ...base, object, relation: 'not a relation', subject }),
    ).toThrow();
    expect(() =>
      RelationTuple.write({
        ...base,
        object,
        subject: { kind: 'userset', ref: { type: 'group', id: 'eng' }, relation: 'bad relation' },
      }),
    ).toThrow();
  });
});
