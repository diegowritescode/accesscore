import { Email } from './email';

describe('Email', () => {
  it('normalizes to trimmed lowercase', () => {
    const result = Email.create('  Foo@Example.COM ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('foo@example.com');
    }
  });

  it('rejects malformed input', () => {
    for (const bad of ['', 'no-at', 'a@b', 'a@@b.com', 'has space@x.com', 'trailing@dot.']) {
      expect(Email.create(bad).ok).toBe(false);
    }
  });

  it('compares by normalized value', () => {
    const a = Email.create('User@Example.com');
    const b = Email.create('user@example.com');
    expect(a.ok && b.ok && a.value.equals(b.value)).toBe(true);
  });
});
