import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type RevocationStore } from '../../domain/ports/revocation-store';

const PREFIX = 'authn:revoked:';

export class RedisRevocationStore implements RevocationStore {
  private readonly logger = new Logger('RevocationStore');

  constructor(private readonly redis: Redis) {}

  async revoke(subject: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`${PREFIX}${subject}`, '1', 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }

  async isRevoked(subject: string): Promise<boolean> {
    try {
      return (await this.redis.exists(`${PREFIX}${subject}`)) === 1;
    } catch (error) {
      this.logger.error('revocation check failed; failing closed', error as Error);
      return true;
    }
  }
}
