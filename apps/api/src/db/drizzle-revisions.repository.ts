import { sql } from 'drizzle-orm';
import { Revision } from '../shared/kernel/revision';
import { type RevisionsRepository } from '../shared/persistence/revisions-repository';
import { type Tx } from '../shared/persistence/unit-of-work';
import { type Executor } from './db.module';
import { revisions } from './schema';

const REVISION_LOCK_KEY = 4242442442;

export class DrizzleRevisionsRepository implements RevisionsRepository {
  async allocate(tx: Tx): Promise<Revision> {
    const executor = tx.executor as Executor;
    await executor.execute(sql`SELECT pg_advisory_xact_lock(${REVISION_LOCK_KEY})`);
    const rows = await executor
      .insert(revisions)
      .values({})
      .returning({ revision: revisions.revision });
    const row = rows[0];
    if (!row) {
      throw new Error('failed to allocate a revision');
    }
    return Revision.fromValue(row.revision);
  }
}
