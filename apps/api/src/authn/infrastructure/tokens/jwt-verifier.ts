import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import { err, ok, type Result } from '../../../shared/result';
import { type Clock } from '../../../shared/kernel/clock';
import { JwksProvider } from '../jwks/jwks-provider';

export type VerifyError =
  'malformed' | 'unknown_kid' | 'alg_mismatch' | 'bad_signature' | 'expired' | 'not_yet_valid';

export type VerifiedClaims = Record<string, unknown>;

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

    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
      return err('expired');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) {
      return err('not_yet_valid');
    }

    return ok(payload);
  }
}
