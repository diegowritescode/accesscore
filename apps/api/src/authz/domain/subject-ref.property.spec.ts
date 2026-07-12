import fc from 'fast-check';
import { encodeSubject, parseSubject, type SubjectRef } from './subject-ref';

const identifier = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
    minLength: 1,
    maxLength: 24,
  })
  .map((chars) => chars.join(''));

const entityRef = fc.record({ type: identifier, id: identifier });

const subjectRef: fc.Arbitrary<SubjectRef> = fc.oneof(
  entityRef.map((ref) => ({ kind: 'subject', ref }) as const),
  fc
    .record({ ref: entityRef, relation: identifier })
    .map(({ ref, relation }) => ({ kind: 'userset', ref, relation }) as const),
);

describe('SubjectRef encode/parse', () => {
  it('round-trips any subject or userset through its canonical form', () => {
    fc.assert(
      fc.property(subjectRef, (subject) => {
        expect(parseSubject(encodeSubject(subject))).toEqual(subject);
      }),
    );
  });

  it('parses a direct subject', () => {
    expect(parseSubject('user:alice')).toEqual({
      kind: 'subject',
      ref: { type: 'user', id: 'alice' },
    });
  });

  it('parses a userset subject', () => {
    expect(parseSubject('group:eng#member')).toEqual({
      kind: 'userset',
      ref: { type: 'group', id: 'eng' },
      relation: 'member',
    });
  });

  it('rejects a malformed reference', () => {
    expect(() => parseSubject('nocolon')).toThrow();
    expect(() => parseSubject('group:eng#')).toThrow();
  });
});
