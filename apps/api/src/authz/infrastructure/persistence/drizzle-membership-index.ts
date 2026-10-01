import { and, eq, gt, lte, sql } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type EntityRef } from '../../domain/entity-ref';
import { type FlatMember } from '../../domain/evaluate';
import {
  type MembershipHit,
  type MembershipIndexReader,
  type MembershipIndexStore,
  type MembershipSetRef,
} from '../../domain/ports/membership-index';
import {
  flattenedMemberships,
  flattenedMembershipSets,
  indexCursors,
  namespaceDefinitions,
  relationTupleChangelog,
} from './schema';

const CURSOR_NAME = 'flattened_memberships';
const LOCK_KEY = 4242442443;

export class NoopMembershipIndexReader implements MembershipIndexReader {
  membershipsOf(): Promise<MembershipHit[]> {
    return Promise.resolve([]);
  }

  organizationVersion(): Promise<Revision> {
    return Promise.resolve(Revision.fromValue(Number.MAX_SAFE_INTEGER));
  }
}

export class DrizzleMembershipIndexStore implements MembershipIndexStore, MembershipIndexReader {
  constructor(private readonly db: Database) {}

  async membershipsOf(orgId: OrgId, member: EntityRef, tx: Tx): Promise<MembershipHit[]> {
    const executor = tx.executor as Executor;
    const rows = await executor
      .select({
        setType: flattenedMemberships.setType,
        setId: flattenedMemberships.setId,
        setRelation: flattenedMemberships.setRelation,
        depth: flattenedMemberships.depth,
        validAtRevision: flattenedMembershipSets.validAtRevision,
      })
      .from(flattenedMemberships)
      .innerJoin(
        flattenedMembershipSets,
        and(
          eq(flattenedMembershipSets.orgId, flattenedMemberships.orgId),
          eq(flattenedMembershipSets.setType, flattenedMemberships.setType),
          eq(flattenedMembershipSets.setId, flattenedMemberships.setId),
          eq(flattenedMembershipSets.setRelation, flattenedMemberships.setRelation),
        ),
      )
      .where(
        and(
          eq(flattenedMemberships.orgId, orgId.value),
          eq(flattenedMemberships.memberType, member.type),
          eq(flattenedMemberships.memberId, member.id),
        ),
      );
    return rows.map((row) => ({
      set: { object: { type: row.setType, id: row.setId }, relation: row.setRelation },
      depth: row.depth,
      validAtRevision: Revision.fromValue(row.validAtRevision),
    }));
  }

  async organizationVersion(orgId: OrgId, tx: Tx): Promise<Revision> {
    const executor = tx.executor as Executor;
    const result = await executor.execute<{ version: string | number }>(
      sql`SELECT GREATEST(
        COALESCE((SELECT MAX(${relationTupleChangelog.revision}) FROM ${relationTupleChangelog}
          WHERE ${relationTupleChangelog.orgId} = ${orgId.value}), 0),
        COALESCE((SELECT MAX(${namespaceDefinitions.revision}) FROM ${namespaceDefinitions}
          WHERE ${namespaceDefinitions.orgId} = ${orgId.value}), 0)
      ) AS version`,
    );
    const rows = result as unknown as { rows?: { version: string | number }[] };
    return Revision.fromValue(Number(rows.rows?.[0]?.version ?? 0));
  }

  async listOrgsWithNamespaceChanges(after: Revision, upTo: Revision, tx: Tx): Promise<OrgId[]> {
    const executor = tx.executor as Executor;
    const rows = await executor
      .selectDistinct({ orgId: namespaceDefinitions.orgId })
      .from(namespaceDefinitions)
      .where(
        and(
          gt(namespaceDefinitions.revision, after.value),
          lte(namespaceDefinitions.revision, upTo.value),
        ),
      );
    return rows.map((row) => OrgId.fromString(row.orgId));
  }

  async replace(
    orgId: OrgId,
    set: MembershipSetRef,
    members: readonly FlatMember[],
    validAt: Revision,
    tx: Tx,
  ): Promise<void> {
    const executor = tx.executor as Executor;
    await this.deleteMembers(executor, orgId, set);
    if (members.length > 0) {
      await executor.insert(flattenedMemberships).values(
        members.map((member) => ({
          orgId: orgId.value,
          setType: set.object.type,
          setId: set.object.id,
          setRelation: set.relation,
          memberType: member.ref.type,
          memberId: member.ref.id,
          depth: member.depth,
        })),
      );
    }
    await executor
      .insert(flattenedMembershipSets)
      .values({
        orgId: orgId.value,
        setType: set.object.type,
        setId: set.object.id,
        setRelation: set.relation,
        validAtRevision: validAt.value,
      })
      .onConflictDoUpdate({
        target: [
          flattenedMembershipSets.orgId,
          flattenedMembershipSets.setType,
          flattenedMembershipSets.setId,
          flattenedMembershipSets.setRelation,
        ],
        set: { validAtRevision: validAt.value },
      });
  }

  async remove(orgId: OrgId, set: MembershipSetRef, tx: Tx): Promise<void> {
    const executor = tx.executor as Executor;
    await this.deleteMembers(executor, orgId, set);
    await executor
      .delete(flattenedMembershipSets)
      .where(
        and(
          eq(flattenedMembershipSets.orgId, orgId.value),
          eq(flattenedMembershipSets.setType, set.object.type),
          eq(flattenedMembershipSets.setId, set.object.id),
          eq(flattenedMembershipSets.setRelation, set.relation),
        ),
      );
  }

  async listSets(orgId: OrgId, tx?: Tx): Promise<MembershipSetRef[]> {
    const executor = (tx?.executor as Executor | undefined) ?? this.db;
    const rows = await executor
      .select()
      .from(flattenedMembershipSets)
      .where(eq(flattenedMembershipSets.orgId, orgId.value));
    return rows.map((row) => ({
      object: { type: row.setType, id: row.setId },
      relation: row.setRelation,
    }));
  }

  async readCursor(tx?: Tx): Promise<Revision> {
    const executor = (tx?.executor as Executor | undefined) ?? this.db;
    const rows = await executor
      .select()
      .from(indexCursors)
      .where(eq(indexCursors.name, CURSOR_NAME));
    return Revision.fromValue(rows[0]?.revision ?? 0);
  }

  async writeCursor(revision: Revision, tx: Tx): Promise<void> {
    const executor = tx.executor as Executor;
    await executor
      .insert(indexCursors)
      .values({ name: CURSOR_NAME, revision: revision.value })
      .onConflictDoUpdate({
        target: [indexCursors.name],
        set: { revision: revision.value },
      });
  }

  async tryLock(tx: Tx): Promise<boolean> {
    const executor = tx.executor as Executor;
    const result = await executor.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`,
    );
    const rows = result as unknown as { rows?: { locked: boolean }[] };
    return rows.rows?.[0]?.locked === true;
  }

  private async deleteMembers(
    executor: Executor,
    orgId: OrgId,
    set: MembershipSetRef,
  ): Promise<void> {
    await executor
      .delete(flattenedMemberships)
      .where(
        and(
          eq(flattenedMemberships.orgId, orgId.value),
          eq(flattenedMemberships.setType, set.object.type),
          eq(flattenedMemberships.setId, set.object.id),
          eq(flattenedMemberships.setRelation, set.relation),
        ),
      );
  }
}
