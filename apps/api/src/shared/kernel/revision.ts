export class Revision {
  private constructor(readonly value: number) {}

  static fromValue(value: number): Revision {
    return new Revision(value);
  }

  isAtLeast(other: Revision): boolean {
    return this.value >= other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
