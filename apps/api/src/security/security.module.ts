import { Module } from '@nestjs/common';
import { DB, type Database } from '../db/db.module';
import { CLOCK, type Clock } from '../shared/kernel/clock';
import { SystemClock } from '../shared/kernel/system-clock';
import { AUDIT_LOG } from './domain/ports/audit-log';
import { DrizzleAuditLog } from './infrastructure/drizzle-audit-log';

@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: AUDIT_LOG,
      inject: [DB, CLOCK],
      useFactory: (db: Database, clock: Clock): DrizzleAuditLog => new DrizzleAuditLog(db, clock),
    },
  ],
  exports: [AUDIT_LOG],
})
export class SecurityModule {}
