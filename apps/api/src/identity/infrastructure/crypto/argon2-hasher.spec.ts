import { Argon2Hasher } from './argon2-hasher';
import { Password } from '../../domain/value-objects/password';

const password = (value: string): Password => {
  const result = Password.create(value);
  if (!result.ok) throw new Error('invalid test password');
  return result.value;
};

describe('Argon2Hasher', () => {
  const hasher = new Argon2Hasher();

  it('hashes into an argon2id-encoded string', async () => {
    const hash = await hasher.hash(password('correct horse battery'));
    expect(hash.value.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a correct password', async () => {
    const secret = password('correct horse battery');
    const hash = await hasher.hash(secret);
    await expect(hasher.verify(secret, hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hasher.hash(password('correct horse battery'));
    await expect(hasher.verify(password('wrong password value'), hash)).resolves.toBe(false);
  });

  it('runs dummyVerify without throwing (constant-time anti-enumeration)', async () => {
    await expect(hasher.dummyVerify(password('any password value'))).resolves.toBeUndefined();
  });
});
