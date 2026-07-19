import { randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_BYTES = 20;

export type RandomBytes = (size: number) => Uint8Array;

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export interface OtpauthParams {
  issuer: string;
  account: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

export class TotpSecret {
  private constructor(private readonly value: Uint8Array) {}

  static generate(random: RandomBytes = randomBytes): TotpSecret {
    return new TotpSecret(Uint8Array.from(random(SECRET_BYTES)));
  }

  static fromBytes(bytes: Uint8Array): TotpSecret {
    return new TotpSecret(Uint8Array.from(bytes));
  }

  get bytes(): Uint8Array {
    return Uint8Array.from(this.value);
  }

  toBase32(): string {
    return encodeBase32(this.value);
  }

  toOtpauthUri(params: OtpauthParams): string {
    const label = encodeURIComponent(`${params.issuer}:${params.account}`);
    const query = new URLSearchParams({
      secret: this.toBase32(),
      issuer: params.issuer,
      algorithm: params.algorithm ?? 'SHA1',
      digits: String(params.digits ?? 6),
      period: String(params.period ?? 30),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
  }
}
