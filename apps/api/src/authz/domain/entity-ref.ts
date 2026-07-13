import { isIdentifier } from './identifier';

export interface EntityRef {
  readonly type: string;
  readonly id: string;
}

const RESERVED_ID_CHARS = /[:#@]/;

export function assertWritableEntityRef(ref: EntityRef): void {
  if (!isIdentifier(ref.type)) {
    throw new Error(`invalid entity type: ${ref.type}`);
  }
  if (ref.id.length === 0 || RESERVED_ID_CHARS.test(ref.id)) {
    throw new Error(`invalid entity id: ${ref.id}`);
  }
}

export function formatEntityRef(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`;
}

export function parseEntityRef(value: string): EntityRef {
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`invalid entity reference: ${value}`);
  }
  return { type: value.slice(0, separator), id: value.slice(separator + 1) };
}
