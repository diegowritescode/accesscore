import { randomUUID } from 'node:crypto';
import { VaultTransitSecretEncryptor } from '../../src/identity/infrastructure/crypto/vault-transit-secret-encryptor';

const addr = process.env.VAULT_ADDR ?? 'http://localhost:8200';
const token = process.env.VAULT_TOKEN ?? 'accesscore-dev-token';

describe('VaultTransitSecretEncryptor (integration)', () => {
  const encryptor = new VaultTransitSecretEncryptor({
    addr,
    token,
    keyName: `mfa-int-${randomUUID().slice(0, 8)}`,
  });

  it('encrypts and decrypts a secret through Vault Transit', async () => {
    const secret = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const ciphertext = await encryptor.encrypt(secret);
    expect(ciphertext.startsWith('vault:v1:')).toBe(true);

    const decrypted = await encryptor.decrypt(ciphertext);
    expect([...decrypted]).toEqual([...secret]);
  });

  it('produces distinct ciphertexts and never exposes the plaintext', async () => {
    const secret = new Uint8Array([42, 42, 42]);
    const a = await encryptor.encrypt(secret);
    const b = await encryptor.encrypt(secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain('Kioq=');
  });
});
