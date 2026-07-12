import { err, ok, type Result } from '../../../shared/result';

export type EmailError = 'invalid_email';

export class Email {
  private static readonly pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(readonly value: string) {}

  static create(input: string): Result<Email, EmailError> {
    const normalized = input.trim().toLowerCase();
    if (normalized.length > 254 || !Email.pattern.test(normalized)) {
      return err('invalid_email');
    }
    return ok(new Email(normalized));
  }

  static reconstitute(value: string): Email {
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
