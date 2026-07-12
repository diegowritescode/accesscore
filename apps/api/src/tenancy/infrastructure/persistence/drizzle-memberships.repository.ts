import { and, asc, eq } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { UserId } from '../../../shared/kernel/user-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type Membership, type MembershipStatus } from '../../domain/membership';
import { type MembershipsRepository } from '../../domain/ports/memberships-repository';
import { memberships } from './schema';

export class DrizzleMembershipsRepository implements MembershipsRepository {
  constructor(private readonly db: Database) {}

  async create(membership: Membership, tx?: Tx): Promise<void> {
    await ((tx?.executor as Executor) ?? this.db).insert(memberships).values({
      id: membership.id,
      userId: membership.userId.value,
      orgId: membership.orgId.value,
      status: membership.status,
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

  private toDomain(row: typeof memberships.$inferSelect): Membership {
    return {
      id: row.id,
      userId: UserId.fromString(row.userId),
      orgId: OrgId.fromString(row.orgId),
      status: row.status as MembershipStatus,
      joinedAt: row.joinedAt,
    };
  }
}
