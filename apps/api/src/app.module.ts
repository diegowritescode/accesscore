import { Module } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [EnvModule, DbModule, HealthModule],
})
export class AppModule {}
