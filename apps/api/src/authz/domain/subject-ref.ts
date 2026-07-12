import { type EntityRef, formatEntityRef, parseEntityRef } from './entity-ref';

export type SubjectRef =
  | { readonly kind: 'subject'; readonly ref: EntityRef }
  | { readonly kind: 'userset'; readonly ref: EntityRef; readonly relation: string };

export function encodeSubject(subject: SubjectRef): string {
  const object = formatEntityRef(subject.ref);
  return subject.kind === 'userset' ? `${object}#${subject.relation}` : object;
}

export function parseSubject(value: string): SubjectRef {
  const hash = value.indexOf('#');
  if (hash === -1) {
    return { kind: 'subject', ref: parseEntityRef(value) };
  }
  const relation = value.slice(hash + 1);
  if (relation.length === 0 || relation.includes('#')) {
    throw new Error(`invalid userset subject: ${value}`);
  }
  return { kind: 'userset', ref: parseEntityRef(value.slice(0, hash)), relation };
}
