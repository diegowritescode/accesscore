import { and, asc, eq } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { UserId } from '../../../shared/kernel/user-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import {
  type Membership,
  type MembershipRole,
  type MembershipStatus,
} from '../../domain/membership';
import { type MembershipsRepository } from '../../domain/ports/memberships-repository';
import { type OrgRoleReader } from '../../domain/ports/org-role-reader';
import { memberships } from './schema';

export class DrizzleMembershipsRepository implements MembershipsRepository, OrgRoleReader {
  constructor(private readonly db: Database) {}

  async create(membership: Membership, tx?: Tx): Promise<void> {
    await ((tx?.executor as Executor) ?? this.db).insert(memberships).values({
      id: membership.id,
      userId: membership.userId.value,
      orgId: membership.orgId.value,
      status: membership.status,
      role: membership.role,
      joinedAt: membership.joinedAt,
    });
  }

  async findActiveByUser(userId: UserId): Promise<Membership[]> {
    const rows = await this.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId.value), eq(memberships.status, 'active')))
      .orderBy(asc(memberships.joinedAt));
    return rows.map((row) => this.toDomain(row));
  }

  async roleOf(userId: UserId, orgId: OrgId): Promise<MembershipRole | null> {
    const rows = await this.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId.value),
          eq(memberships.orgId, orgId.value),
          eq(memberships.status, 'active'),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? (row.role as MembershipRole) : null;
  }

  private toDomain(row: typeof memberships.$inferSelect): Membership {
    return {
      id: row.id,
      userId: UserId.fromString(row.userId),
      orgId: OrgId.fromString(row.orgId),
      status: row.status as MembershipStatus,
      role: row.role as MembershipRole,
      joinedAt: row.joinedAt,
    };
  }
}
