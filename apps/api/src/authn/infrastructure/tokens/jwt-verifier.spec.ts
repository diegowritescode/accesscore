import { type Clock } from '../../domain/ports/clock';
import { JwksProvider } from '../jwks/jwks-provider';
import { SoftwareSigner } from '../signing/software-signer';
import { JwtVerifier } from './jwt-verifier';

const now = new Date('2026-07-12T12:00:00.000Z');
const nowSec = Math.floor(now.getTime() / 1000);
const clock: Clock = { now: () => now };

const signer = new SoftwareSigner();
const verifier = new JwtVerifier(new JwksProvider(signer), clock);

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const makeToken = async (
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> => {
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await signer.sign(new TextEncoder().encode(signingInput));
  return `${signingInput}.${signature.value}`;
};

const validHeader = { alg: 'EdDSA', typ: 'JWT', kid: 'software-1' };
const validPayload = {
  sub: 'user-1',
  sid: 'session-1',
  aal: 1,
  nbf: nowSec - 10,
  exp: nowSec + 900,
};

describe('JwtVerifier', () => {
  it('verifies a well-formed EdDSA token resolved by kid', async () => {
    const result = await verifier.verify(await makeToken(validHeader, validPayload));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sub).toBe('user-1');
  });

  it('rejects a header claiming a different alg than the JWK (no header-driven alg)', async () => {
    const result = await verifier.verify(
      await makeToken({ ...validHeader, alg: 'HS256' }, validPayload),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('alg_mismatch');
  });

  it('rejects alg:none even though the payload is otherwise valid', async () => {
    const result = await verifier.verify(
      await makeToken({ ...validHeader, alg: 'none' }, validPayload),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('alg_mismatch');
  });

  it('rejects an unknown kid', async () => {
    const result = await verifier.verify(
      await makeToken({ ...validHeader, kid: 'does-not-exist' }, validPayload),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unknown_kid');
  });

  it('rejects a tampered payload', async () => {
    const token = await makeToken(validHeader, validPayload);
    const [h, , s] = token.split('.');
    const forged = `${h}.${encode({ ...validPayload, sub: 'attacker' })}.${s}`;

    const result = await verifier.verify(forged);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('bad_signature');
  });

  it('rejects an expired token', async () => {
    const result = await verifier.verify(
      await makeToken(validHeader, { ...validPayload, exp: nowSec - 1 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('expired');
  });
});
