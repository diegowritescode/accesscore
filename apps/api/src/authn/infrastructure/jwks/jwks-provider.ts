import { type Clock } from '../../../shared/kernel/clock';
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

const MIN_REFRESH_MS = 5_000;

export class JwksProvider {
  private cache: Jwks | null = null;
  private cachedAtMs = 0;

  constructor(
    private readonly signer: PublicKeySource,
    private readonly clock: Clock,
    private readonly ttlSeconds: number,
  ) {}

  async jwks(): Promise<Jwks> {
    if (this.cache && this.nowMs() - this.cachedAtMs < this.ttlSeconds * 1000) {
      return this.cache;
    }
    return this.load();
  }

  async refresh(): Promise<Jwks> {
    if (this.cache && this.nowMs() - this.cachedAtMs < MIN_REFRESH_MS) {
      return this.cache;
    }
    return this.load();
  }

  private async load(): Promise<Jwks> {
    const keys = await this.signer.publicKeys();
    this.cache = {
      keys: keys.map((key) => ({
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(key.key).toString('base64url'),
        kid: key.kid,
        alg: key.alg,
        use: 'sig',
      })),
    };
    this.cachedAtMs = this.nowMs();
    return this.cache;
  }

  private nowMs(): number {
    return this.clock.now().getTime();
  }
}
