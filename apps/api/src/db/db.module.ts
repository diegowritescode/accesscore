import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { REVISIONS_REPOSITORY } from '../shared/persistence/revisions-repository';
import { UNIT_OF_WORK } from '../shared/persistence/unit-of-work';
import { DrizzleRevisionsRepository } from './drizzle-revisions.repository';
import { DrizzleUnitOfWork } from './drizzle-unit-of-work';

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

export type Database = NodePgDatabase<Record<string, never>>;
export type Executor = Database;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env): Pool => new Pool({ connectionString: env.DATABASE_URL }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool),
    },
    {
      provide: UNIT_OF_WORK,
      inject: [DB],
      useFactory: (db: Database): DrizzleUnitOfWork => new DrizzleUnitOfWork(db),
    },
    { provide: REVISIONS_REPOSITORY, useClass: DrizzleRevisionsRepository },
  ],
  exports: [PG_POOL, DB, UNIT_OF_WORK, REVISIONS_REPOSITORY],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
