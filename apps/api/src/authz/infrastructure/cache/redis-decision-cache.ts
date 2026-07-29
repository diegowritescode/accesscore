import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type Decision, type Effect, type Reason } from '../../domain/decision';
import { type DecisionCache, type DecisionCacheKey } from '../../domain/ports/decision-cache';

interface CachedValue {
  readonly e: Effect;
  readonly r: readonly Reason[];
  readonly v: number;
}

export class RedisDecisionCache implements DecisionCache {
  private readonly logger = new Logger('DecisionCache');

  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly ttlSeconds: number,
  ) {}

  async get(key: DecisionCacheKey): Promise<Decision | null> {
    try {
      const raw = await this.redis.get(this.redisKey(key));
      if (!raw) {
        return null;
      }
      const value = JSON.parse(raw) as CachedValue;
      if (value.v !== key.revision.value) {
        return null;
      }
      return { effect: value.e, reasons: value.r };
    } catch (error) {
      this.logger.error('decision cache read failed; evaluating authoritatively', error as Error);
      return null;
    }
  }

  async set(key: DecisionCacheKey, decision: Decision): Promise<void> {
    try {
      const value: CachedValue = {
        e: decision.effect,
        r: decision.reasons,
        v: key.revision.value,
      };
      await this.redis.set(this.redisKey(key), JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.error('decision cache write failed; decision already returned', error as Error);
    }
  }

  private redisKey(key: DecisionCacheKey): string {
    const digest = createHash('sha256')
      .update(`${key.subject}\x1f${key.action}\x1f${key.resource}`)
      .digest('base64url');
    return `${this.prefix}:${key.orgId.value}:${key.revision.value}:${digest}`;
  }
}

export class NoopDecisionCache implements DecisionCache {
  async get(): Promise<Decision | null> {
    return null;
  }

  async set(): Promise<void> {
    return undefined;
  }
}
