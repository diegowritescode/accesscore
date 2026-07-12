import { randomUUID } from 'node:crypto';

export class OrgId {
  private constructor(readonly value: string) {}

  static generate(): OrgId {
    return new OrgId(randomUUID());
  }

  static fromString(value: string): OrgId {
    return new OrgId(value);
  }

  equals(other: OrgId): boolean {
    return this.value === other.value;
  }
}
