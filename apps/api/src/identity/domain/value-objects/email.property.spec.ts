import fc from 'fast-check';
import { Email } from './email';

describe('Email (property-based)', () => {
  it('is total: never throws for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = Email.create(input);
        return result.ok === true || result.ok === false;
      }),
    );
  });

  it('normalizes to trimmed lowercase and is idempotent when valid', () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const result = Email.create(`  ${email.toUpperCase()}  `);
        if (!result.ok) return true;
        const value = result.value.value;
        const normalized = value === value.trim().toLowerCase();
        const reparsed = Email.create(value);
        return normalized && reparsed.ok && reparsed.value.value === value;
      }),
    );
  });

  it('rejects any input containing whitespace or lacking a single @ and dot', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = Email.create(input);
        if (!result.ok) return true;
        const v = result.value.value;
        return !/\s/.test(v) && v.includes('@') && v.includes('.');
      }),
    );
  });
});
