import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { OrgId } from '../../src/shared/kernel/org-id';
import { Revision } from '../../src/shared/kernel/revision';
import { type Decision } from '../../src/authz/domain/decision';
import { type DecisionCacheKey } from '../../src/authz/domain/ports/decision-cache';
import { RedisDecisionCache } from '../../src/authz/infrastructure/cache/redis-decision-cache';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const PREFIX = 'test:authz:dec';

const permit: Decision = {
  effect: 'permit',
  reasons: [{ code: 'grant.direct', message: 'held', relation: 'viewer', path: ['a#viewer@b'] }],
};

const keyFor = (org: OrgId, revision: number): DecisionCacheKey => ({
  orgId: org,
  subject: 'user:alice',
  action: 'document.read',
  resource: 'document:1',
  revision: Revision.fromValue(revision),
});

describe('RedisDecisionCache (integration)', () => {
  const redis = new Redis(REDIS_URL);
  const cache = new RedisDecisionCache(redis, PREFIX, 60);

  afterAll(async () => {
    await redis.quit();
  });

  it('round-trips a decision and returns it on a subsequent get', async () => {
    const key = keyFor(OrgId.generate(), 5);
    expect(await cache.get(key)).toBeNull();

    await cache.set(key, permit);

    expect(await cache.get(key)).toEqual(permit);
  });

  it('bounds the entry with a TTL', async () => {
    const key = keyFor(OrgId.generate(), 5);
    await cache.set(key, permit);

    const digest = createHash('sha256')
      .update(`${key.subject}\x1f${key.action}\x1f${key.resource}`)
      .digest('base64url');
    const ttl = await redis.ttl(`${PREFIX}:${key.orgId.value}:5:${digest}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('isolates tenants: another org never reads the entry', async () => {
    const orgA = OrgId.generate();
    const orgB = OrgId.generate();
    await cache.set(keyFor(orgA, 5), permit);

    expect(await cache.get(keyFor(orgB, 5))).toBeNull();
  });

  it('misses at a different revision (the revision is the invalidator)', async () => {
    const org = OrgId.generate();
    await cache.set(keyFor(org, 5), permit);

    expect(await cache.get(keyFor(org, 6))).toBeNull();
    expect(await cache.get(keyFor(org, 5))).toEqual(permit);
  });
});
