import { and, eq } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import {
  type ObjectRelationQuery,
  type RelationTupleKey,
  type RelationTupleStore,
} from '../../domain/ports/relation-tuple-store';
import { RelationTuple } from '../../domain/relation-tuple';
import { encodeSubject, parseSubject } from '../../domain/subject-ref';
import { relationTuples } from './schema';

export class DrizzleRelationTupleStore implements RelationTupleStore {
  constructor(private readonly db: Database) {}

  async upsert(tuple: RelationTuple, tx?: Tx): Promise<void> {
    const executor = (tx?.executor as Executor) ?? this.db;
    await executor
      .insert(relationTuples)
      .values({
        orgId: tuple.orgId.value,
        namespace: tuple.object.type,
        objectId: tuple.object.id,
        relation: tuple.relation,
        subject: encodeSubject(tuple.subject),
        revision: tuple.revision.value,
        createdAt: tuple.createdAt,
      })
      .onConflictDoUpdate({
        target: [
          relationTuples.orgId,
          relationTuples.namespace,
          relationTuples.objectId,
          relationTuples.relation,
          relationTuples.subject,
        ],
        set: { revision: tuple.revision.value },
      });
  }

  async delete(key: RelationTupleKey, tx?: Tx): Promise<number> {
    const executor = (tx?.executor as Executor) ?? this.db;
    const result = await executor
      .delete(relationTuples)
      .where(
        and(
          eq(relationTuples.orgId, key.orgId.value),
          eq(relationTuples.namespace, key.object.type),
          eq(relationTuples.objectId, key.object.id),
          eq(relationTuples.relation, key.relation),
          eq(relationTuples.subject, encodeSubject(key.subject)),
        ),
      );
    return result.rowCount ?? 0;
  }

  async listByObject(query: ObjectRelationQuery, tx?: Tx): Promise<RelationTuple[]> {
    const executor = (tx?.executor as Executor) ?? this.db;
    const rows = await executor
      .select()
      .from(relationTuples)
      .where(
        and(
          eq(relationTuples.orgId, query.orgId.value),
          eq(relationTuples.namespace, query.object.type),
          eq(relationTuples.objectId, query.object.id),
          eq(relationTuples.relation, query.relation),
        ),
      );
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: typeof relationTuples.$inferSelect): RelationTuple {
    return RelationTuple.reconstitute({
      orgId: OrgId.fromString(row.orgId),
      object: { type: row.namespace, id: row.objectId },
      relation: row.relation,
      subject: parseSubject(row.subject),
      revision: Revision.fromValue(row.revision),
      createdAt: row.createdAt,
    });
  }
}
