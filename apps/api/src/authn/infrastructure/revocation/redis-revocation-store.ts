import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type RevocationStore } from '../../domain/ports/revocation-store';

const PREFIX = 'authn:revoked:';

export class RedisRevocationStore implements RevocationStore {
  private readonly logger = new Logger('RevocationStore');

  constructor(private readonly redis: Redis) {}

  async revoke(subject: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(`${PREFIX}${subject}`, '1', 'EX', Math.max(1, Math.ceil(ttlSeconds)));
    } catch (error) {
      this.logger.error('revocation write failed; access token bounded by its TTL', error as Error);
    }
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
