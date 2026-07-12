import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import { JwksProvider } from '../../src/authn/infrastructure/jwks/jwks-provider';
import { VaultTransitSigner } from '../../src/authn/infrastructure/signing/vault-transit-signer';

const config = {
  addr: process.env.VAULT_ADDR ?? 'http://localhost:8200',
  token: process.env.VAULT_TOKEN ?? 'accesscore-dev-token',
  keyName: 'accesscore-signing-test',
};

describe('VaultTransitSigner (integration)', () => {
  const signer = new VaultTransitSigner(config);
  const payload = new TextEncoder().encode('eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1c2VyLTEifQ');

  it('signs and verifies through Vault without holding the private key', async () => {
    const signature = await signer.sign(payload);

    expect(signature.alg).toBe('EdDSA');
    expect(signature.kid).toMatch(/^accesscore-signing-test-\d+$/);
    expect(await signer.verify(payload, signature)).toBe(true);
    expect(await signer.verify(new TextEncoder().encode('tampered'), signature)).toBe(false);
  });

  it('publishes JWKS a consumer can independently verify a Vault signature with', async () => {
    const signature = await signer.sign(payload);
    const jwks = await new JwksProvider(signer).jwks();
    const jwk = jwks.keys.find((key) => key.kid === signature.kid);

    expect(jwk).toBeDefined();
    expect(jwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });

    const publicKey = createPublicKey({ key: jwk! as unknown as JsonWebKey, format: 'jwk' });
    const rawSignature = Buffer.from(signature.value, 'base64url');

    expect(cryptoVerify(null, payload, publicKey, rawSignature)).toBe(true);
    expect(cryptoVerify(null, new TextEncoder().encode('tampered'), publicKey, rawSignature)).toBe(
      false,
    );
  });
});
