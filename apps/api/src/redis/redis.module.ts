import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env): Redis =>
        new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onApplicationShutdown(): void {
    if (this.redis.status !== 'end') {
      this.redis.disconnect();
    }
  }
}
