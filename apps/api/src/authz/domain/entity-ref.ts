export interface EntityRef {
  readonly type: string;
  readonly id: string;
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
