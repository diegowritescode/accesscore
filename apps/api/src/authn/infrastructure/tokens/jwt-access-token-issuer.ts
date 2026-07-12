import { randomUUID } from 'node:crypto';
import {
  type AccessTokenClaims,
  type AccessTokenIssuer,
  type IssuedAccessToken,
} from '../../domain/ports/access-token-issuer';
import { type Clock } from '../../../shared/kernel/clock';
import { type TokenSigner } from '../../domain/ports/token-signer';

export interface AccessTokenConfig {
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

const encodeSegment = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(
    private readonly tokenSigner: TokenSigner,
    private readonly clock: Clock,
    private readonly config: AccessTokenConfig,
  ) {}

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + this.config.ttlSeconds;
    const jti = randomUUID();
    const active = await this.tokenSigner.resolveActive();

    const header = { alg: 'EdDSA', typ: 'JWT', kid: active.kid };
    const payload = {
      iss: this.config.issuer,
      aud: this.config.audience,
      sub: claims.sub,
      sid: claims.sid,
      ...(claims.org ? { org: claims.org } : {}),
      jti,
      aal: claims.aal,
      auth_time: Math.floor(claims.authTime.getTime() / 1000),
      iat,
      nbf: iat,
      exp,
    };

    const signingInput = `${encodeSegment(header)}.${encodeSegment(payload)}`;
    const signature = await this.tokenSigner.sign(
      new TextEncoder().encode(signingInput),
      active.version,
    );
    if (signature.kid !== active.kid) {
      throw new Error('signing key rotated during issuance');
    }

    return {
      token: `${signingInput}.${signature.value}`,
      jti,
      expiresAt: new Date(exp * 1000),
      expiresInSeconds: this.config.ttlSeconds,
    };
  }
}
