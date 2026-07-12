import { createHash, randomBytes } from 'node:crypto';
import { type GeneratedToken, type TokenGenerator } from '../../domain/ports/token-generator';

export class CryptoTokenGenerator implements TokenGenerator {
  generate(): GeneratedToken {
    const raw = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
  }
}
