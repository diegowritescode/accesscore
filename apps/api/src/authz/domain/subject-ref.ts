import {
  assertWritableEntityRef,
  type EntityRef,
  formatEntityRef,
  parseEntityRef,
} from './entity-ref';
import { isIdentifier } from './identifier';

export type SubjectRef =
  | { readonly kind: 'subject'; readonly ref: EntityRef }
  | { readonly kind: 'userset'; readonly ref: EntityRef; readonly relation: string };

export function assertWritableSubject(subject: SubjectRef): void {
  assertWritableEntityRef(subject.ref);
  if (subject.kind === 'userset' && !isIdentifier(subject.relation)) {
    throw new Error(`invalid userset relation: ${subject.relation}`);
  }
}

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
