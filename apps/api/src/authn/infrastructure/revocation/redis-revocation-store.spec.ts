import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisRevocationStore } from './redis-revocation-store';

class FakeRedis {
  private readonly keys = new Set<string>();

  set(key: string): Promise<'OK'> {
    this.keys.add(key);
    return Promise.resolve('OK');
  }

  exists(key: string): Promise<number> {
    return Promise.resolve(this.keys.has(key) ? 1 : 0);
  }
}

describe('RedisRevocationStore', () => {
  afterEach(() => jest.restoreAllMocks());

  it('revokes a jti and reports it as revoked', async () => {
    const store = new RedisRevocationStore(new FakeRedis() as unknown as Redis);

    expect(await store.isRevoked('jti-1')).toBe(false);
    await store.revoke('jti-1', 300);
    expect(await store.isRevoked('jti-1')).toBe(true);
  });

  it('fails closed (treats as revoked) when the store is unavailable', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failing = { exists: () => Promise.reject(new Error('redis down')) };
    const store = new RedisRevocationStore(failing as unknown as Redis);

    expect(await store.isRevoked('jti-2')).toBe(true);
  });
});
