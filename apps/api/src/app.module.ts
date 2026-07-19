import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthnModule } from './authn/authn.module';
import { AuthzModule } from './authz/authz.module';
import { ENV } from './config/env.module';
import type { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { MetricsModule } from './observability/metrics.module';
import { RedisModule } from './redis/redis.module';
import { SecurityModule } from './security/security.module';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req, res) => {
            const header = req.headers['x-request-id'];
            const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie'],
            censor: '[redacted]',
          },
          autoLogging: {
            ignore: (req) => {
              const path = (req.url ?? '').split('?')[0];
              return (
                path === '/health' ||
                path === '/ready' ||
                path === '/reference' ||
                path === '/metrics'
              );
            },
          },
        },
      }),
    }),
    DbModule,
    RedisModule,
    HealthModule,
    MetricsModule,
    IdentityModule,
    AuthnModule,
    AuthzModule,
    TenancyModule,
    SecurityModule,
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
