import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleRefreshTokensRepository } from '../../src/authn/infrastructure/persistence/drizzle-refresh-tokens.repository';
import { DrizzleSessionsRepository } from '../../src/authn/infrastructure/persistence/drizzle-sessions.repository';
import { DrizzleTokenFamiliesRepository } from '../../src/authn/infrastructure/persistence/drizzle-token-families.repository';
import { type RefreshToken } from '../../src/authn/domain/refresh-token';
import { SessionId } from '../../src/authn/domain/value-objects/session-id';
import { TokenFamilyId } from '../../src/authn/domain/value-objects/token-family-id';
import { UserId } from '../../src/shared/kernel/user-id';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-12T00:00:00.000Z');
const later = new Date('2026-07-26T00:00:00.000Z');

describe('refresh rotation persistence (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const refreshTokens = new DrizzleRefreshTokensRepository(db);
  const families = new DrizzleTokenFamiliesRepository(db);
  const sessions = new DrizzleSessionsRepository(db);

  const userId = UserId.generate();
  const sessionId = SessionId.generate();
  const familyId = TokenFamilyId.generate();

  const token = (generation: number, status: RefreshToken['status']): RefreshToken => ({
    id: randomUUID(),
    familyId,
    tokenHash: `hash-${generation}-${randomUUID()}`,
    generation,
    status,
    createdAt: now,
    expiresAt: later,
    consumedAt: null,
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE refresh_tokens, token_families, sessions, outbox, users RESTART IDENTITY CASCADE',
    );
    await pool.query(
      'INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId.value, 'refresh-owner@example.com', 'x', 'active', now, now],
    );
    await sessions.create({
      id: sessionId,
      userId,
      orgId: null,
      aal: 1,
      authTime: now,
      status: 'active',
      deviceLabel: null,
      userAgent: null,
      ip: null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: later,
      revokedAt: null,
    });
    await families.create({
      id: familyId,
      userId,
      sessionId,
      status: 'active',
      createdAt: now,
      revokedAt: null,
      revokedReason: null,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rotates atomically: only one of two concurrent rotations wins', async () => {
    const active = token(1, 'active');
    await refreshTokens.add(active);

    const [a, b] = await Promise.all([
      refreshTokens.rotate(active.id, token(2, 'active'), now),
      refreshTokens.rotate(active.id, token(2, 'active'), now),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
    const count = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM refresh_tokens');
    expect(count.rows[0]?.n).toBe(2);
    const presented = await pool.query<{ status: string }>(
      'SELECT status FROM refresh_tokens WHERE id = $1',
      [active.id],
    );
    expect(presented.rows[0]?.status).toBe('rotated');
  });

  it('finds the active token in a family', async () => {
    await refreshTokens.add(token(1, 'rotated'));
    const active = token(2, 'active');
    await refreshTokens.add(active);

    const found = await refreshTokens.findActiveByFamily(familyId);

    expect(found?.id).toBe(active.id);
    expect(found?.generation).toBe(2);
  });

  it('revokeForReuse revokes the family + all its tokens and emits an outbox event', async () => {
    await refreshTokens.add(token(1, 'rotated'));
    await refreshTokens.add(token(2, 'active'));

    await families.revokeForReuse(familyId, now, {
      userId: userId.value,
      sessionId: sessionId.value,
      generation: 1,
    });

    const family = await pool.query<{ status: string; revoked_reason: string }>(
      'SELECT status, revoked_reason FROM token_families WHERE id = $1',
      [familyId.value],
    );
    expect(family.rows[0]?.status).toBe('revoked');
    expect(family.rows[0]?.revoked_reason).toBe('reuse_detected');

    const live = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM refresh_tokens WHERE status != 'revoked'",
    );
    expect(live.rows[0]?.n).toBe(0);

    const event = await pool.query<{ type: string; payload: { generation: number } }>(
      "SELECT type, payload FROM outbox WHERE type = 'authn.refresh_token_reused'",
    );
    expect(event.rowCount).toBe(1);
    expect(event.rows[0]?.payload.generation).toBe(1);
  });
});
