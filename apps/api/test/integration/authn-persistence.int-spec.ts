import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleRefreshTokensRepository } from '../../src/authn/infrastructure/persistence/drizzle-refresh-tokens.repository';
import { DrizzleSessionsRepository } from '../../src/authn/infrastructure/persistence/drizzle-sessions.repository';
import { DrizzleTokenFamiliesRepository } from '../../src/authn/infrastructure/persistence/drizzle-token-families.repository';
import { SessionId } from '../../src/authn/domain/value-objects/session-id';
import { TokenFamilyId } from '../../src/authn/domain/value-objects/token-family-id';
import { UserId } from '../../src/shared/kernel/user-id';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-12T00:00:00.000Z');
const later = new Date('2026-07-19T00:00:00.000Z');

describe('authn persistence (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const sessions = new DrizzleSessionsRepository(db);
  const families = new DrizzleTokenFamiliesRepository(db);
  const refreshTokens = new DrizzleRefreshTokensRepository(db);

  const userId = UserId.generate();

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE refresh_tokens, token_families, sessions, users RESTART IDENTITY CASCADE',
    );
    await pool.query(
      'INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId.value, 'session-owner@example.com', 'x', 'active', now, now],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  const seedSession = async (): Promise<SessionId> => {
    const id = SessionId.generate();
    await sessions.create({
      id,
      userId,
      orgId: null,
      aal: 1,
      authTime: now,
      status: 'active',
      deviceLabel: 'iPhone 15',
      userAgent: 'AccessCore/1.0',
      ip: '203.0.113.7',
      createdAt: now,
      lastSeenAt: now,
      expiresAt: later,
      revokedAt: null,
    });
    return id;
  };

  const seedFamily = async (sessionId: SessionId): Promise<TokenFamilyId> => {
    const id = TokenFamilyId.generate();
    await families.create({
      id,
      userId,
      sessionId,
      status: 'active',
      createdAt: now,
      revokedAt: null,
      revokedReason: null,
    });
    return id;
  };

  it('persists and reloads a session with its device metadata', async () => {
    const sessionId = await seedSession();

    const loaded = await sessions.findById(sessionId);

    expect(loaded).not.toBeNull();
    expect(loaded?.userId.value).toBe(userId.value);
    expect(loaded?.deviceLabel).toBe('iPhone 15');
    expect(loaded?.ip).toBe('203.0.113.7');
    expect(loaded?.status).toBe('active');
  });

  it('elevates an active session and refuses to elevate a revoked one', async () => {
    const sessionId = await seedSession();

    expect(await sessions.elevate(sessionId, 2, later)).toBe(true);
    const loaded = await sessions.findById(sessionId);
    expect(loaded?.aal).toBe(2);
    expect(loaded?.authTime.getTime()).toBe(later.getTime());

    await sessions.revoke(sessionId, later);
    expect(await sessions.elevate(sessionId, 2, later)).toBe(false);
  });

  it('stores hashed refresh tokens bound to a family and finds them by hash', async () => {
    const sessionId = await seedSession();
    const familyId = await seedFamily(sessionId);
    await refreshTokens.add({
      id: randomUUID(),
      familyId,
      tokenHash: 'sha256-of-refresh',
      generation: 1,
      status: 'active',
      createdAt: now,
      expiresAt: later,
      consumedAt: null,
    });

    const loaded = await refreshTokens.findByHash('sha256-of-refresh');

    expect(loaded?.familyId.value).toBe(familyId.value);
    expect(loaded?.generation).toBe(1);
    expect(loaded?.status).toBe('active');
  });

  it('revokes a token family with a reason', async () => {
    const sessionId = await seedSession();
    const familyId = await seedFamily(sessionId);

    await families.revoke(familyId, 'reuse_detected', now);

    const loaded = await families.findById(familyId);
    expect(loaded?.status).toBe('revoked');
    expect(loaded?.revokedReason).toBe('reuse_detected');
    expect(loaded?.revokedAt).toEqual(now);
  });

  it('enforces the unique refresh-token-hash constraint', async () => {
    const sessionId = await seedSession();
    const familyId = await seedFamily(sessionId);
    const token = {
      id: randomUUID(),
      familyId,
      tokenHash: 'duplicate-hash',
      generation: 1,
      status: 'active' as const,
      createdAt: now,
      expiresAt: later,
      consumedAt: null,
    };
    await refreshTokens.add(token);

    await expect(refreshTokens.add({ ...token, id: randomUUID() })).rejects.toThrow();
  });
});
