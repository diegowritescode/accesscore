import { and, eq, or, sql } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { type OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type FlatMember } from '../../domain/evaluate';
import {
  type MaterializedSet,
  type MembershipIndexStore,
  type MembershipSetRef,
} from '../../domain/ports/membership-index';
import { flattenedMemberships, flattenedMembershipSets, indexCursors } from './schema';

const CURSOR_NAME = 'flattened_memberships';
const LOCK_KEY = 4242442443;

const setKey = (set: MembershipSetRef): string =>
  `${set.object.type}${set.object.id}${set.relation}`;

export class DrizzleMembershipIndexStore implements MembershipIndexStore {
  constructor(private readonly db: Database) {}

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

  async load(orgId: OrgId, sets: readonly MembershipSetRef[], tx?: Tx): Promise<MaterializedSet[]> {
    if (sets.length === 0) {
      return [];
    }
    const executor = (tx?.executor as Executor | undefined) ?? this.db;

    const setRows = await executor
      .select()
      .from(flattenedMembershipSets)
      .where(
        and(
          eq(flattenedMembershipSets.orgId, orgId.value),
          or(
            ...sets.map((set) =>
              and(
                eq(flattenedMembershipSets.setType, set.object.type),
                eq(flattenedMembershipSets.setId, set.object.id),
                eq(flattenedMembershipSets.setRelation, set.relation),
              ),
            ),
          ),
        ),
      );
    if (setRows.length === 0) {
      return [];
    }

    const memberRows = await executor
      .select()
      .from(flattenedMemberships)
      .where(
        and(
          eq(flattenedMemberships.orgId, orgId.value),
          or(
            ...setRows.map((row) =>
              and(
                eq(flattenedMemberships.setType, row.setType),
                eq(flattenedMemberships.setId, row.setId),
                eq(flattenedMemberships.setRelation, row.setRelation),
              ),
            ),
          ),
        ),
      );
    const bySet = new Map<string, FlatMember[]>();
    for (const row of memberRows) {
      const key = setKey({
        object: { type: row.setType, id: row.setId },
        relation: row.setRelation,
      });
      const bucket = bySet.get(key);
      const member: FlatMember = {
        ref: { type: row.memberType, id: row.memberId },
        depth: row.depth,
      };
      if (bucket) {
        bucket.push(member);
      } else {
        bySet.set(key, [member]);
      }
    }

    return setRows.map((row) => {
      const set: MembershipSetRef = {
        object: { type: row.setType, id: row.setId },
        relation: row.setRelation,
      };
      return {
        set,
        validAtRevision: Revision.fromValue(row.validAtRevision),
        members: bySet.get(setKey(set)) ?? [],
      };
    });
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
