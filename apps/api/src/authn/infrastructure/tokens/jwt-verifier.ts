import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import { type Clock } from '../../../shared/kernel/clock';
import { err, ok, type Result } from '../../../shared/result';
import { JwksProvider } from '../jwks/jwks-provider';

export type VerifyError =
  | 'malformed'
  | 'unknown_kid'
  | 'alg_mismatch'
  | 'bad_signature'
  | 'untrusted_issuer'
  | 'wrong_audience'
  | 'expired'
  | 'not_yet_valid';

export type VerifiedClaims = Record<string, unknown>;

export interface JwtVerifierConfig {
  issuer: string;
  audience: string;
  clockSkewSeconds: number;
}

interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
  kid?: unknown;
}

export const JWT_VERIFIER = Symbol('JWT_VERIFIER');

export class JwtVerifier {
  constructor(
    private readonly jwks: JwksProvider,
    private readonly clock: Clock,
    private readonly config: JwtVerifierConfig,
  ) {}

  async verify(token: string): Promise<Result<VerifiedClaims, VerifyError>> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return err('malformed');
    }
    const [headerB64, payloadB64, signatureB64] = parts;

    let header: JwtHeader;
    let payload: VerifiedClaims;
    try {
      header = JSON.parse(Buffer.from(headerB64!, 'base64url').toString('utf8')) as JwtHeader;
      payload = JSON.parse(
        Buffer.from(payloadB64!, 'base64url').toString('utf8'),
      ) as VerifiedClaims;
    } catch {
      return err('malformed');
    }
    if (header.typ !== 'JWT' || typeof header.kid !== 'string') {
      return err('malformed');
    }

    const { keys } = await this.jwks.jwks();
    const jwk = keys.find((candidate) => candidate.kid === header.kid);
    if (!jwk) {
      return err('unknown_kid');
    }
    if (jwk.alg !== 'EdDSA' || header.alg !== jwk.alg) {
      return err('alg_mismatch');
    }

    const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
    const verified = cryptoVerify(
      null,
      new TextEncoder().encode(`${headerB64!}.${payloadB64!}`),
      publicKey,
      Buffer.from(signatureB64!, 'base64url'),
    );
    if (!verified) {
      return err('bad_signature');
    }

    if (payload.iss !== this.config.issuer) {
      return err('untrusted_issuer');
    }
    if (!this.audienceMatches(payload.aud)) {
      return err('wrong_audience');
    }

    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    const skew = this.config.clockSkewSeconds;
    if (typeof payload.exp !== 'number' || payload.exp + skew <= nowSeconds) {
      return err('expired');
    }
    if (typeof payload.nbf === 'number' && payload.nbf - skew > nowSeconds) {
      return err('not_yet_valid');
    }

    return ok(payload);
  }

  private audienceMatches(aud: unknown): boolean {
    if (typeof aud === 'string') {
      return aud === this.config.audience;
    }
    if (Array.isArray(aud)) {
      return aud.includes(this.config.audience);
    }
    return false;
  }
}
