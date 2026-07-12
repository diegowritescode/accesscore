import { type PublicKey, type Signer } from '../../domain/ports/signer';
import { JwksProvider } from './jwks-provider';

const rawKey = new Uint8Array(32).fill(7);

const fakeSigner: Signer = {
  activeKid: () => Promise.resolve('accesscore-signing-1'),
  sign: () => Promise.resolve({ kid: 'k1', alg: 'EdDSA', value: 'sig' }),
  verify: () => Promise.resolve(true),
  publicKeys: (): Promise<PublicKey[]> =>
    Promise.resolve([{ kid: 'accesscore-signing-1', alg: 'EdDSA', key: rawKey }]),
};

describe('JwksProvider', () => {
  it('maps signer public keys to Ed25519 JWKs', async () => {
    const jwks = await new JwksProvider(fakeSigner).jwks();

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
});
