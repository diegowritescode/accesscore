import { SoftwareSigner } from './software-signer';

describe('SoftwareSigner', () => {
  const signer = new SoftwareSigner();
  const payload = new TextEncoder().encode('header.payload');

  it('signs and verifies a payload round-trip', async () => {
    const signature = await signer.sign(payload);

    expect(signature.alg).toBe('EdDSA');
    expect(signature.kid).toBe('software-1');
    expect(await signer.verify(payload, signature)).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const signature = await signer.sign(payload);
    const tampered = new TextEncoder().encode('header.PAYLOAD');

    expect(await signer.verify(tampered, signature)).toBe(false);
  });

  it('rejects a signature presented under an unknown kid', async () => {
    const signature = await signer.sign(payload);

    expect(await signer.verify(payload, { ...signature, kid: 'unknown' })).toBe(false);
  });

  it('exposes a 32-byte Ed25519 public key', async () => {
    const keys = await signer.publicKeys();

    expect(keys).toHaveLength(1);
    expect(keys[0]?.alg).toBe('EdDSA');
    expect(keys[0]?.kid).toBe('software-1');
    expect(keys[0]?.key).toHaveLength(32);
  });
});
