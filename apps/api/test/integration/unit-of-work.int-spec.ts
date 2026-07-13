import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleRevisionsRepository } from '../../src/db/drizzle-revisions.repository';
import { DrizzleUnitOfWork } from '../../src/db/drizzle-unit-of-work';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

describe('UnitOfWork + revisions changelog (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const uow = new DrizzleUnitOfWork(drizzle(pool));
  const revisions = new DrizzleRevisionsRepository();

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE revisions RESTART IDENTITY');
  });

  afterAll(async () => {
    await pool.end();
  });

  const count = async (): Promise<number> => {
    const result = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM revisions');
    return result.rows[0]?.n ?? -1;
  };

  it('allocates monotonically increasing, committed revisions', async () => {
    const first = await uow.withTransaction((tx) => revisions.allocate(tx));
    const second = await uow.withTransaction((tx) => revisions.allocate(tx));

    expect(second.value).toBeGreaterThan(first.value);
    expect(await count()).toBe(2);
  });

  it('rolls back the whole unit on error, persisting nothing', async () => {
    await expect(
      uow.withTransaction(async (tx) => {
        await revisions.allocate(tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await count()).toBe(0);
  });

  it('serializes concurrent allocations under the advisory lock into distinct revisions', async () => {
    const [a, b] = await Promise.all([
      uow.withTransaction((tx) => revisions.allocate(tx)),
      uow.withTransaction((tx) => revisions.allocate(tx)),
    ]);

    expect(new Set([a.value, b.value])).toEqual(new Set([1, 2]));
    expect(await count()).toBe(2);
  });

  it('reports the committed high-water mark via current() after concurrent commits', async () => {
    await Promise.all([
      uow.withTransaction((tx) => revisions.allocate(tx)),
      uow.withTransaction((tx) => revisions.allocate(tx)),
    ]);

    const highWater = await uow.withTransaction((tx) => revisions.current(tx));
    expect(highWater.value).toBe(2);
  });
});
