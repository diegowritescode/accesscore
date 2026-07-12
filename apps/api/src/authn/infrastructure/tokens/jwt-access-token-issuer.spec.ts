import { type Clock } from '../../domain/ports/clock';
import { SoftwareSigner } from '../signing/software-signer';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer';

const now = new Date('2026-07-12T12:00:00.000Z');
const iat = Math.floor(now.getTime() / 1000);
const clock: Clock = { now: () => now };

describe('JwtAccessTokenIssuer', () => {
  const signer = new SoftwareSigner();
  const issuer = new JwtAccessTokenIssuer(signer, clock, {
    issuer: 'https://auth.accesscore.dev',
    audience: 'accesscore',
    ttlSeconds: 900,
  });

  it('issues a JWT carrying the required claims that the signer can verify', async () => {
    const result = await issuer.issue({ sub: 'user-1', sid: 'session-1', aal: 1, authTime: now });

    const [headerB64, payloadB64, signatureB64] = result.token.split('.');
    const header = JSON.parse(Buffer.from(headerB64!, 'base64url').toString('utf8')) as {
      alg: string;
      typ: string;
      kid: string;
    };
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;

    expect(header).toEqual({ alg: 'EdDSA', typ: 'JWT', kid: 'software-1' });
    expect(payload).toMatchObject({
      iss: 'https://auth.accesscore.dev',
      aud: 'accesscore',
      sub: 'user-1',
      sid: 'session-1',
      aal: 1,
      auth_time: iat,
      iat,
      nbf: iat,
      exp: iat + 900,
      jti: result.jti,
    });
    expect(result.expiresInSeconds).toBe(900);

    const signingInput = new TextEncoder().encode(`${headerB64!}.${payloadB64!}`);
    const verified = await signer.verify(signingInput, {
      kid: header.kid,
      alg: 'EdDSA',
      value: signatureB64!,
    });
    expect(verified).toBe(true);
  });
});
