import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleUsersRepository } from '../../src/identity/infrastructure/persistence/drizzle-users.repository';
import { User } from '../../src/identity/domain/user';
import { Email } from '../../src/identity/domain/value-objects/email';
import { PasswordHash } from '../../src/identity/domain/value-objects/password-hash';
import { UserId } from '../../src/shared/kernel/user-id';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const email = (value: string): Email => {
  const result = Email.create(value);
  if (!result.ok) throw new Error(`invalid test email: ${value}`);
  return result.value;
};

const buildUser = (address: string): User =>
  User.register({
    id: UserId.generate(),
    email: email(address),
    passwordHash: PasswordHash.fromEncoded('$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA'),
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

describe('DrizzleUsersRepository (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new DrizzleUsersRepository(drizzle(pool));

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE users, outbox RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('saves a user and finds it by email', async () => {
    const user = buildUser('alice@example.com');
    await repository.save(user);

    const found = await repository.findByEmail(user.email);

    expect(found).not.toBeNull();
    expect(found?.id.value).toBe(user.id.value);
    expect(found?.status).toBe('pending_verification');
  });

  it('writes domain events to the outbox in the same transaction', async () => {
    await repository.save(buildUser('bob@example.com'));

    const result = await pool.query<{ type: string }>('SELECT type FROM outbox');

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.type).toBe('identity.user_registered');
  });

  it('enforces the global unique-email constraint', async () => {
    await repository.save(buildUser('dup@example.com'));

    await expect(repository.save(buildUser('dup@example.com'))).rejects.toThrow();
  });
});
