import { Password } from './password';

describe('Password', () => {
  it('accepts a policy-compliant password', () => {
    expect(Password.create('abcdefgh').ok).toBe(true);
  });

  it('rejects a password below the minimum length', () => {
    const result = Password.create('abc');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('too_short');
    }
  });

  it('rejects a password above the maximum length', () => {
    const result = Password.create('a'.repeat(129));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('too_long');
    }
  });
});
