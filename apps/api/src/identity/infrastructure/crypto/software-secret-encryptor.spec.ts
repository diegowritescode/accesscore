import { randomBytes } from 'node:crypto';
import { SoftwareSecretEncryptor } from './software-secret-encryptor';

describe('SoftwareSecretEncryptor', () => {
  it('round-trips a secret', async () => {
    const encryptor = new SoftwareSecretEncryptor();
    const secret = new Uint8Array(randomBytes(20));
    const ciphertext = await encryptor.encrypt(secret);
    expect(ciphertext.startsWith('sw:v1:')).toBe(true);
    expect([...(await encryptor.decrypt(ciphertext))]).toEqual([...secret]);
  });

  it('produces a fresh ciphertext each time (random IV)', async () => {
    const encryptor = new SoftwareSecretEncryptor();
    const secret = new Uint8Array([1, 2, 3, 4]);
    expect(await encryptor.encrypt(secret)).not.toBe(await encryptor.encrypt(secret));
  });

  it('decrypts a ciphertext produced under the same key', async () => {
    const key = randomBytes(32);
    const secret = new Uint8Array([9, 8, 7]);
    const ciphertext = await new SoftwareSecretEncryptor(key).encrypt(secret);
    expect([...(await new SoftwareSecretEncryptor(key).decrypt(ciphertext))]).toEqual([...secret]);
  });

  it('rejects malformed ciphertext', async () => {
    const encryptor = new SoftwareSecretEncryptor();
    await expect(encryptor.decrypt('not-a-ciphertext')).rejects.toThrow();
  });
});
