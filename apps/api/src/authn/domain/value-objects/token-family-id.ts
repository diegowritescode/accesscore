import { randomUUID } from 'node:crypto';

export class TokenFamilyId {
  private constructor(readonly value: string) {}

  static generate(): TokenFamilyId {
    return new TokenFamilyId(randomUUID());
  }

  static fromString(value: string): TokenFamilyId {
    return new TokenFamilyId(value);
  }

  equals(other: TokenFamilyId): boolean {
    return this.value === other.value;
  }
}
