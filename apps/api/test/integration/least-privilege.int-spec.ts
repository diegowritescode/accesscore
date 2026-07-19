import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';
const APP_PASSWORD = 'least-privilege-int-test';

describe('Least-privilege runtime role (integration)', () => {
  const owner = new Pool({ connectionString: DATABASE_URL });
  let app: Pool;

  beforeAll(async () => {
    await owner.query(`ALTER ROLE accesscore_app WITH LOGIN PASSWORD '${APP_PASSWORD}'`);
    const url = new URL(DATABASE_URL);
    url.username = 'accesscore_app';
    url.password = APP_PASSWORD;
    app = new Pool({ connectionString: url.toString() });
  });

  afterAll(async () => {
    await app?.end();
    await owner.query('ALTER ROLE accesscore_app WITH NOLOGIN');
    await owner.end();
  });

  it('may read the append-only audit trail', async () => {
    await expect(app.query('SELECT 1 FROM decision_log LIMIT 1')).resolves.toBeDefined();
  });

  it('may not UPDATE the decision log', async () => {
    await expect(
      app.query('UPDATE decision_log SET effect = effect WHERE false'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('may not DELETE from the decision log', async () => {
    await expect(app.query('DELETE FROM decision_log WHERE false')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('may not UPDATE the revisions changelog', async () => {
    await expect(
      app.query('UPDATE revisions SET revision = revision WHERE false'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('may read but not UPDATE the security audit chain', async () => {
    await expect(app.query('SELECT 1 FROM security_audit LIMIT 1')).resolves.toBeDefined();
    await expect(
      app.query('UPDATE security_audit SET hash = hash WHERE false'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('may not DELETE from the security audit chain', async () => {
    await expect(app.query('DELETE FROM security_audit WHERE false')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('may still mutate a non-append-only table', async () => {
    await expect(
      app.query('UPDATE sessions SET status = status WHERE false'),
    ).resolves.toBeDefined();
  });
});
