import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (pings Postgres)' })
  async readiness(): Promise<{ status: string }> {
    await this.pool.query('SELECT 1');
    return { status: 'ready' };
  }
}
