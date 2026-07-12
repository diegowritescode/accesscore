import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthnModule } from './authn/authn.module';
import { ENV } from './config/env.module';
import type { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { RedisModule } from './redis/redis.module';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
    EnvModule,
    DbModule,
    RedisModule,
    HealthModule,
    IdentityModule,
    AuthnModule,
    TenancyModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ ttl: env.THROTTLE_TTL_SECONDS * 1000, limit: env.THROTTLE_LIMIT }],
        skipIf: () => env.NODE_ENV === 'test',
      }),
    }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
