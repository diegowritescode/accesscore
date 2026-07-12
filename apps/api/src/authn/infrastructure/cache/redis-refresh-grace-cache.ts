import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type GracePair, type RefreshGraceCache } from '../../domain/ports/refresh-grace-cache';

const PREFIX = 'authn:refresh_grace:';

export class RedisRefreshGraceCache implements RefreshGraceCache {
  private readonly logger = new Logger('RefreshGraceCache');

  constructor(private readonly redis: Redis) {}

  async get(presentedHash: string): Promise<GracePair | null> {
    try {
      const raw = await this.redis.get(`${PREFIX}${presentedHash}`);
      return raw ? (JSON.parse(raw) as GracePair) : null;
    } catch (error) {
      this.logger.error('grace cache read failed', error as Error);
      return null;
    }
  }

  async put(presentedHash: string, pair: GracePair, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    try {
      await this.redis.set(
        `${PREFIX}${presentedHash}`,
        JSON.stringify(pair),
        'EX',
        Math.ceil(ttlSeconds),
      );
    } catch (error) {
      this.logger.error('grace cache write failed', error as Error);
    }
  }
}
