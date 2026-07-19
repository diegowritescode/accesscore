import { TotpSecret } from './totp-secret';

const RFC_SECRET = new Uint8Array(Buffer.from('12345678901234567890'));
const RFC_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TotpSecret', () => {
  it('generates a 20-byte secret', () => {
    const secret = TotpSecret.generate();
    expect(secret.bytes).toHaveLength(20);
  });

  it('uses the injected randomness', () => {
    const secret = TotpSecret.generate(() => RFC_SECRET);
    expect(secret.toBase32()).toBe(RFC_BASE32);
  });

  it('round-trips bytes and encodes Base32 per RFC 4648', () => {
    expect(TotpSecret.fromBytes(RFC_SECRET).toBase32()).toBe(RFC_BASE32);
    expect([...TotpSecret.fromBytes(RFC_SECRET).bytes]).toEqual([...RFC_SECRET]);
  });

  it('does not expose the internal buffer', () => {
    const secret = TotpSecret.fromBytes(RFC_SECRET);
    secret.bytes[0] = 0;
    expect(secret.bytes[0]).toBe(RFC_SECRET[0]);
  });

  it('builds an otpauth URI with the standard TOTP parameters', () => {
    const uri = TotpSecret.fromBytes(RFC_SECRET).toOtpauthUri({
      issuer: 'AccessCore',
      account: 'demo@accesscore.dev',
    });
    expect(uri).toContain('otpauth://totp/AccessCore%3Ademo%40accesscore.dev');
    expect(uri).toContain(`secret=${RFC_BASE32}`);
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
