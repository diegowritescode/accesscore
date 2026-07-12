import { type Signer } from '../../domain/ports/signer';

type PublicKeySource = Pick<Signer, 'publicKeys'>;

export interface Jwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  kid: string;
  alg: 'EdDSA';
  use: 'sig';
}

export interface Jwks {
  keys: Jwk[];
}

export const JWKS_PROVIDER = Symbol('JWKS_PROVIDER');

export class JwksProvider {
  constructor(private readonly signer: PublicKeySource) {}

  async jwks(): Promise<Jwks> {
    const keys = await this.signer.publicKeys();
    return {
      keys: keys.map((key) => ({
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(key.key).toString('base64url'),
        kid: key.kid,
        alg: key.alg,
        use: 'sig',
      })),
    };
  }
}
