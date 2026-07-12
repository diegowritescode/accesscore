import Redis from 'ioredis';
import { RedisRevocationStore } from '../../src/authn/infrastructure/revocation/redis-revocation-store';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const jti = 'jti-int-test';

describe('RedisRevocationStore (integration)', () => {
  const redis = new Redis(REDIS_URL);
  const store = new RedisRevocationStore(redis);

  beforeEach(async () => {
    await redis.del(`authn:revoked:${jti}`);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('revokes a jti with a bounded TTL and reports it as revoked', async () => {
    expect(await store.isRevoked(jti)).toBe(false);

    await store.revoke(jti, 60);

    expect(await store.isRevoked(jti)).toBe(true);
    const ttl = await redis.ttl(`authn:revoked:${jti}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('reports an unknown jti as not revoked', async () => {
    expect(await store.isRevoked('never-revoked')).toBe(false);
  });
});
