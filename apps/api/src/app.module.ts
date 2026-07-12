import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthnModule } from './authn/authn.module';
import { EnvModule } from './config/env.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { RedisModule } from './redis/redis.module';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter';

@Module({
  imports: [EnvModule, DbModule, RedisModule, HealthModule, IdentityModule, AuthnModule],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
