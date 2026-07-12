import { Module } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';

@Module({
  imports: [EnvModule, DbModule, HealthModule, IdentityModule],
})
export class AppModule {}
