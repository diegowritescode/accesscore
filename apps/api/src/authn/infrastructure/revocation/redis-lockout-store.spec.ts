import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisLockoutStore } from './redis-lockout-store';

const policy = { threshold: 3, windowSeconds: 60 };

class FakeRedis {
  private readonly store = new Map<string, number>();
  eval(_script: string, _numkeys: number, key: string): Promise<number> {
    const next = (this.store.get(key) ?? 0) + 1;
    this.store.set(key, next);
    return Promise.resolve(next);
  }
  get(key: string): Promise<string | null> {
    const value = this.store.get(key);
    return Promise.resolve(value === undefined ? null : String(value));
  }
  del(key: string): Promise<number> {
    return Promise.resolve(this.store.delete(key) ? 1 : 0);
  }
}

class BrokenRedis {
  eval(): Promise<number> {
    return Promise.reject(new Error('down'));
  }
  get(): Promise<string | null> {
    return Promise.reject(new Error('down'));
  }
  del(): Promise<number> {
    return Promise.reject(new Error('down'));
  }
}

describe('RedisLockoutStore', () => {
  afterEach(() => jest.restoreAllMocks());

  it('locks once the threshold is reached and resets clears it', async () => {
    const store = new RedisLockoutStore(new FakeRedis() as unknown as Redis);

    expect(await store.registerFailure('acct:a', policy)).toEqual({
      locked: false,
      retriesLeft: 2,
    });
    expect(await store.registerFailure('acct:a', policy)).toEqual({
      locked: false,
      retriesLeft: 1,
    });
    expect(await store.registerFailure('acct:a', policy)).toEqual({ locked: true, retriesLeft: 0 });

    expect(await store.isLocked('acct:a', policy)).toBe(true);
    expect(await store.isLocked('acct:b', policy)).toBe(false);

    await store.reset('acct:a');
    expect(await store.isLocked('acct:a', policy)).toBe(false);
  });

  it('fails open when the store is unavailable', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const store = new RedisLockoutStore(new BrokenRedis() as unknown as Redis);

    expect(await store.registerFailure('acct:a', policy)).toEqual({
      locked: false,
      retriesLeft: 3,
    });
    expect(await store.isLocked('acct:a', policy)).toBe(false);
    await expect(store.reset('acct:a')).resolves.toBeUndefined();
  });
});
