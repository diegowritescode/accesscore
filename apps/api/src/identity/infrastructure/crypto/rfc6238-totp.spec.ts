import { Rfc6238Totp } from './rfc6238-totp';

const SECRET = new Uint8Array(Buffer.from('12345678901234567890'));
const totp = new Rfc6238Totp();

describe('Rfc6238Totp', () => {
  it('matches RFC 6238 vectors truncated to 6 digits', () => {
    expect(totp.verify(SECRET, '287082', new Date(59_000), { window: 0 })).toEqual({
      valid: true,
      step: 1,
    });
    expect(totp.verify(SECRET, '081804', new Date(1_111_111_109_000), { window: 0 })).toEqual({
      valid: true,
      step: 37_037_036,
    });
  });

  it('rejects a wrong code', () => {
    expect(totp.verify(SECRET, '000000', new Date(59_000), { window: 1 }).valid).toBe(false);
  });

  it('accepts a code from an adjacent step within the drift window', () => {
    expect(totp.verify(SECRET, '287082', new Date(89_000), { window: 1 })).toEqual({
      valid: true,
      step: 1,
    });
    expect(totp.verify(SECRET, '287082', new Date(89_000), { window: 0 }).valid).toBe(false);
  });

  it('rejects a replayed code at or below the last used step', () => {
    expect(totp.verify(SECRET, '287082', new Date(59_000), { window: 1, afterStep: 1 }).valid).toBe(
      false,
    );
    expect(totp.verify(SECRET, '287082', new Date(59_000), { window: 1, afterStep: 0 })).toEqual({
      valid: true,
      step: 1,
    });
  });
});
