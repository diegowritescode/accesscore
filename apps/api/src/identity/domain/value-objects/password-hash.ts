export class PasswordHash {
  private constructor(readonly value: string) {}

  static fromEncoded(encoded: string): PasswordHash {
    return new PasswordHash(encoded);
  }
}
