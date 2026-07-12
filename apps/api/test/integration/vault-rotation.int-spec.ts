import { VaultTransitSigner } from '../../src/authn/infrastructure/signing/vault-transit-signer';

const ADDR = process.env.VAULT_ADDR ?? 'http://localhost:8200';
const TOKEN = process.env.VAULT_TOKEN ?? 'accesscore-dev-token';
const KEY = 'accesscore-signing-rotation-test';

const resetKey = async (): Promise<void> => {
  const headers = { 'X-Vault-Token': TOKEN, 'Content-Type': 'application/json' };
  await fetch(`${ADDR}/v1/transit/keys/${KEY}/config`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deletion_allowed: true }),
  });
  await fetch(`${ADDR}/v1/transit/keys/${KEY}`, { method: 'DELETE', headers });
};

const versions = (signer: VaultTransitSigner): Promise<number[]> =>
  signer.publicKeys().then((keys) => keys.map((key) => key.version));

describe('VaultTransitSigner rotation (integration)', () => {
  const signer = new VaultTransitSigner({ addr: ADDR, token: TOKEN, keyName: KEY });
  const payload = new TextEncoder().encode('rotation-payload');

  beforeAll(async () => {
    await resetKey();
  });

  it('rotates with publish-before-sign and retires after drain', async () => {
    const first = await signer.sign(payload);
    expect(first.kid).toBe(`${KEY}-1`);
    expect(await signer.latestVersion()).toBe(1);

    await signer.rotate();

    expect(await signer.latestVersion()).toBe(2);
    expect(await versions(signer)).toEqual([2, 1]);

    const pinned = await signer.sign(payload, 1);
    expect(pinned.kid).toBe(`${KEY}-1`);
    const latest = await signer.sign(payload);
    expect(latest.kid).toBe(`${KEY}-2`);

    expect(await signer.verify(payload, first)).toBe(true);

    await signer.setMinDecryptionVersion(2);
    expect(await versions(signer)).toEqual([2]);
  });
});
