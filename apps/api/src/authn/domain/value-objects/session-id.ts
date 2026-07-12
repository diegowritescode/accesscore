import { randomUUID } from 'node:crypto';

export class SessionId {
  private constructor(readonly value: string) {}

  static generate(): SessionId {
    return new SessionId(randomUUID());
  }

  static fromString(value: string): SessionId {
    return new SessionId(value);
  }

  equals(other: SessionId): boolean {
    return this.value === other.value;
  }
}
