import { eq } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { Organization } from '../../domain/organization';
import { type OrganizationsRepository } from '../../domain/ports/organizations-repository';
import { organizations } from './schema';

export class DrizzleOrganizationsRepository implements OrganizationsRepository {
  constructor(private readonly db: Database) {}

  async create(organization: Organization, tx?: Tx): Promise<void> {
    await ((tx?.executor as Executor) ?? this.db).insert(organizations).values({
      id: organization.id.value,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    });
  }

  async findById(id: OrgId): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id.value))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: typeof organizations.$inferSelect): Organization {
    return Organization.reconstitute({
      id: OrgId.fromString(row.id),
      name: row.name,
      slug: row.slug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
