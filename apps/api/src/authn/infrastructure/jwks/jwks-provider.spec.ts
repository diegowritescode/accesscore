import { type Clock } from '../../../shared/kernel/clock';
import { type PublicKey } from '../../domain/ports/signer';
import { JwksProvider } from './jwks-provider';

const rawKey = new Uint8Array(32).fill(7);

class CountingSource {
  calls = 0;
  publicKeys(): Promise<PublicKey[]> {
    this.calls += 1;
    return Promise.resolve([
      { kid: 'accesscore-signing-1', alg: 'EdDSA', key: rawKey, version: 1 },
    ]);
  }
}

const setup = (ttlSeconds = 300) => {
  const source = new CountingSource();
  let nowMs = Date.parse('2026-07-12T12:00:00.000Z');
  const clock: Clock = { now: () => new Date(nowMs) };
  const provider = new JwksProvider(source, clock, ttlSeconds);
  return { source, provider, advance: (ms: number) => (nowMs += ms) };
};

describe('JwksProvider', () => {
  it('maps signer public keys to Ed25519 JWKs', async () => {
    const { provider } = setup();

    const jwks = await provider.jwks();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      alg: 'EdDSA',
      use: 'sig',
      kid: 'accesscore-signing-1',
    });
    expect(jwks.keys[0]?.x).toBe(Buffer.from(rawKey).toString('base64url'));
  });

  it('caches within the TTL and refetches once it expires', async () => {
    const { source, provider, advance } = setup(300);

    await provider.jwks();
    await provider.jwks();
    expect(source.calls).toBe(1);

    advance(300_000 + 1);
    await provider.jwks();
    expect(source.calls).toBe(2);
  });

  it('refresh() forces a refetch but throttles rapid calls', async () => {
    const { source, provider, advance } = setup(300);

    await provider.jwks();
    await provider.refresh();
    expect(source.calls).toBe(1);

    advance(5_000 + 1);
    await provider.refresh();
    expect(source.calls).toBe(2);
  });
});
