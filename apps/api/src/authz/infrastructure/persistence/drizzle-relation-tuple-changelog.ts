import { and, asc, eq, gt } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import {
  type GlobalTupleChangeQuery,
  type RelationTupleChangelog,
  type TupleChange,
  type TupleChangeOp,
  type TupleChangeQuery,
} from '../../domain/ports/relation-tuple-changelog';
import { encodeSubject, parseSubject } from '../../domain/subject-ref';
import { relationTupleChangelog } from './schema';

export class DrizzleRelationTupleChangelog implements RelationTupleChangelog {
  constructor(private readonly db: Database) {}

  async append(change: TupleChange, tx: Tx): Promise<void> {
    const executor = tx.executor as Executor;
    await executor.insert(relationTupleChangelog).values({
      orgId: change.orgId.value,
      revision: change.revision.value,
      op: change.op,
      namespace: change.object.type,
      objectId: change.object.id,
      relation: change.relation,
      subject: encodeSubject(change.subject),
      recordedAt: change.recordedAt,
    });
  }

  async since(query: TupleChangeQuery, tx?: Tx): Promise<TupleChange[]> {
    const executor = (tx?.executor as Executor | undefined) ?? this.db;
    const rows = await executor
      .select()
      .from(relationTupleChangelog)
      .where(
        and(
          eq(relationTupleChangelog.orgId, query.orgId.value),
          gt(relationTupleChangelog.revision, query.afterRevision.value),
        ),
      )
      .orderBy(
        asc(relationTupleChangelog.revision),
        asc(relationTupleChangelog.namespace),
        asc(relationTupleChangelog.objectId),
        asc(relationTupleChangelog.relation),
        asc(relationTupleChangelog.subject),
      )
      .limit(query.limit);
    return rows.map((row) => this.toDomain(row));
  }

  async sinceAll(query: GlobalTupleChangeQuery, tx?: Tx): Promise<TupleChange[]> {
    const executor = (tx?.executor as Executor | undefined) ?? this.db;
    const rows = await executor
      .select()
      .from(relationTupleChangelog)
      .where(gt(relationTupleChangelog.revision, query.afterRevision.value))
      .orderBy(
        asc(relationTupleChangelog.revision),
        asc(relationTupleChangelog.orgId),
        asc(relationTupleChangelog.namespace),
        asc(relationTupleChangelog.objectId),
        asc(relationTupleChangelog.relation),
        asc(relationTupleChangelog.subject),
      )
      .limit(query.limit);
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: typeof relationTupleChangelog.$inferSelect): TupleChange {
    return {
      orgId: OrgId.fromString(row.orgId),
      revision: Revision.fromValue(row.revision),
      op: row.op as TupleChangeOp,
      object: { type: row.namespace, id: row.objectId },
      relation: row.relation,
      subject: parseSubject(row.subject),
      recordedAt: row.recordedAt,
    };
  }
}
