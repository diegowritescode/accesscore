import { createHash, randomBytes } from 'node:crypto';
import { type GeneratedToken, type TokenGenerator } from '../../domain/ports/token-generator';

export class CryptoTokenGenerator implements TokenGenerator {
  generate(): GeneratedToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
