import type { Redis } from 'ioredis';
import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Decision } from '../../domain/decision';
import { type DecisionCacheKey } from '../../domain/ports/decision-cache';
import { RedisDecisionCache } from './redis-decision-cache';

const permit: Decision = {
  effect: 'permit',
  reasons: [{ code: 'grant.direct', message: 'held' }],
};

const key = (org: OrgId, revision: number): DecisionCacheKey => ({
  orgId: org,
  subject: 'user:alice',
  action: 'document.read',
  resource: 'document:1',
  revision: Revision.fromValue(revision),
});

class MapRedis {
  readonly store = new Map<string, string>();
  lastSet: { key: string; ttl: number } | null = null;
  get(redisKey: string): Promise<string | null> {
    return Promise.resolve(this.store.get(redisKey) ?? null);
  }
  set(redisKey: string, value: string, _mode: string, ttl: number): Promise<'OK'> {
    this.store.set(redisKey, value);
    this.lastSet = { key: redisKey, ttl };
    return Promise.resolve('OK');
  }
}

const asRedis = (fake: object): Redis => fake as unknown as Redis;

describe('RedisDecisionCache', () => {
  it('round-trips a decision through the underlying store', async () => {
    const redis = new MapRedis();
    const cache = new RedisDecisionCache(asRedis(redis), 'authz:dec:v1', 60);
    const k = key(OrgId.generate(), 5);

    expect(await cache.get(k)).toBeNull();
    await cache.set(k, permit);
    expect(await cache.get(k)).toEqual(permit);
  });

  it('composes a tenant- and revision-scoped key and sets the TTL', async () => {
    const redis = new MapRedis();
    const cache = new RedisDecisionCache(asRedis(redis), 'authz:dec:v1', 42);
    const org = OrgId.generate();
    await cache.set(key(org, 7), permit);

    expect(redis.lastSet?.key.startsWith(`authz:dec:v1:${org.value}:7:`)).toBe(true);
    expect(redis.lastSet?.ttl).toBe(42);
  });

  it('treats a value whose stored revision differs from the key as a miss', async () => {
    const redis = new MapRedis();
    const cache = new RedisDecisionCache(asRedis(redis), 'authz:dec:v1', 60);
    const org = OrgId.generate();
    await cache.set(key(org, 5), permit);
    const storedKey = [...redis.store.keys()][0];
    if (!storedKey) throw new Error('expected a cached entry');
    redis.store.set(storedKey, JSON.stringify({ e: 'permit', r: [], v: 999 }));

    expect(await cache.get(key(org, 5))).toBeNull();
  });

  it('fails safe to a miss when the store throws on read', async () => {
    const throwing = asRedis({
      get: () => Promise.reject(new Error('redis down')),
      set: () => Promise.reject(new Error('redis down')),
    });
    const cache = new RedisDecisionCache(throwing, 'authz:dec:v1', 60);

    expect(await cache.get(key(OrgId.generate(), 5))).toBeNull();
    await expect(cache.set(key(OrgId.generate(), 5), permit)).resolves.toBeUndefined();
  });

  it('fails safe to a miss on a corrupt cached value', async () => {
    const redis = new MapRedis();
    const cache = new RedisDecisionCache(asRedis(redis), 'authz:dec:v1', 60);
    const org = OrgId.generate();
    await cache.set(key(org, 5), permit);
    const storedKey = [...redis.store.keys()][0];
    if (!storedKey) throw new Error('expected a cached entry');
    redis.store.set(storedKey, 'not-json');

    expect(await cache.get(key(org, 5))).toBeNull();
  });
});
