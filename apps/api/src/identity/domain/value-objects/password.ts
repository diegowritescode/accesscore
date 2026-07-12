import { err, ok, type Result } from '../../../shared/result';

export type PasswordError = 'too_short' | 'too_long';

export class Password {
  static readonly minLength = 8;
  static readonly maxLength = 128;

  private constructor(readonly value: string) {}

  static create(input: string): Result<Password, PasswordError> {
    if (input.length < Password.minLength) return err('too_short');
    if (input.length > Password.maxLength) return err('too_long');
    return ok(new Password(input));
  }
}
