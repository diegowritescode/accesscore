import { createHmac, timingSafeEqual } from 'node:crypto';
import { type Totp, type TotpVerification, type TotpVerifyOptions } from '../../domain/ports/totp';

const PERIOD_SECONDS = 30;
const DIGITS = 6;

function computeCode(secret: Uint8Array, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', Buffer.from(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

function equals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class Rfc6238Totp implements Totp {
  verify(secret: Uint8Array, code: string, at: Date, options: TotpVerifyOptions): TotpVerification {
    const afterStep = options.afterStep ?? -1;
    const current = Math.floor(at.getTime() / 1000 / PERIOD_SECONDS);
    for (let offset = -options.window; offset <= options.window; offset += 1) {
      const step = current + offset;
      if (step <= afterStep) {
        continue;
      }
      if (equals(computeCode(secret, step), code)) {
        return { valid: true, step };
      }
    }
    return { valid: false, step: -1 };
  }
}
