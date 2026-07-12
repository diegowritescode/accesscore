import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleUnitOfWork } from '../../src/db/drizzle-unit-of-work';
import { UserId } from '../../src/shared/kernel/user-id';
import { TenancyService } from '../../src/tenancy/application/tenancy-service';
import { DrizzleMembershipsRepository } from '../../src/tenancy/infrastructure/persistence/drizzle-memberships.repository';
import { DrizzleOrganizationsRepository } from '../../src/tenancy/infrastructure/persistence/drizzle-organizations.repository';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-12T00:00:00.000Z');

describe('tenancy (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const organizations = new DrizzleOrganizationsRepository(db);
  const memberships = new DrizzleMembershipsRepository(db);
  const service = new TenancyService(organizations, memberships, new DrizzleUnitOfWork(db), {
    now: () => now,
  });
  const userId = UserId.generate();

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE memberships, organizations, refresh_tokens, token_families, sessions, users RESTART IDENTITY CASCADE',
    );
    await pool.query(
      'INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId.value, 'org-owner@example.com', 'x', 'active', now, now],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('provisions a personal organization + active membership atomically', async () => {
    const orgId = await service.provisionPersonalOrganization(userId);

    const org = await organizations.findById(orgId);
    expect(org?.name).toBe('Personal');
    expect(org?.slug).toBe(`u-${userId.value}`);

    const active = await service.findActiveOrganization(userId);
    expect(active?.value).toBe(orgId.value);
  });

  it('returns null active org when the user has no membership', async () => {
    expect(await service.findActiveOrganization(userId)).toBeNull();
  });

  it('rolls back and enforces the unique slug when provisioning twice', async () => {
    await service.provisionPersonalOrganization(userId);

    await expect(service.provisionPersonalOrganization(userId)).rejects.toThrow();

    const orgs = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM organizations');
    const members = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM memberships');
    expect(orgs.rows[0]?.n).toBe(1);
    expect(members.rows[0]?.n).toBe(1);
  });
});
