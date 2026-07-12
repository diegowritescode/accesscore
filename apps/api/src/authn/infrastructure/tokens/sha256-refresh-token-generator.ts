import { createHash, randomBytes } from 'node:crypto';
import {
  type GeneratedRefreshToken,
  type RefreshTokenGenerator,
} from '../../domain/ports/refresh-token-generator';

export class Sha256RefreshTokenGenerator implements RefreshTokenGenerator {
  generate(): GeneratedRefreshToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
