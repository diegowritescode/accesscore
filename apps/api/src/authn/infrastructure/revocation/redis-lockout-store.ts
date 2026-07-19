import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  type LockoutPolicy,
  type LockoutState,
  type LockoutStore,
} from '../../domain/ports/lockout-store';

const PREFIX = 'authn:lockout:';

const INCREMENT = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

export class RedisLockoutStore implements LockoutStore {
  private readonly logger = new Logger('LockoutStore');

  constructor(private readonly redis: Redis) {}

  async registerFailure(key: string, policy: LockoutPolicy): Promise<LockoutState> {
    try {
      const raw = await this.redis.eval(
        INCREMENT,
        1,
        `${PREFIX}${key}`,
        String(policy.windowSeconds),
      );
      const count = Number(raw);
      return {
        locked: count >= policy.threshold,
        retriesLeft: Math.max(0, policy.threshold - count),
      };
    } catch (error) {
      this.logger.error('lockout write failed; allowing the attempt', error as Error);
      return { locked: false, retriesLeft: policy.threshold };
    }
  }

  async isLocked(key: string, policy: LockoutPolicy): Promise<boolean> {
    try {
      const value = await this.redis.get(`${PREFIX}${key}`);
      return Number(value ?? 0) >= policy.threshold;
    } catch (error) {
      this.logger.error('lockout check failed; failing open', error as Error);
      return false;
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.redis.del(`${PREFIX}${key}`);
    } catch (error) {
      this.logger.error('lockout reset failed', error as Error);
    }
  }
}
