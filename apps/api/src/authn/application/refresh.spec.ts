import {
  type AccessTokenIssuer,
  type IssuedAccessToken,
} from '../domain/ports/access-token-issuer';
import { type Clock } from '../../shared/kernel/clock';
import { type GracePair, type RefreshGraceCache } from '../domain/ports/refresh-grace-cache';
import { type RefreshTokenGenerator } from '../domain/ports/refresh-token-generator';
import { type RefreshTokensRepository } from '../domain/ports/refresh-tokens-repository';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type TokenFamiliesRepository } from '../domain/ports/token-families-repository';
import { type RefreshToken, type RefreshTokenStatus } from '../domain/refresh-token';
import { type Session } from '../domain/session';
import { type TokenFamily, type TokenFamilyStatus } from '../domain/token-family';
import { SessionId } from '../domain/value-objects/session-id';
import { TokenFamilyId } from '../domain/value-objects/token-family-id';
import { UserId } from '../../shared/kernel/user-id';
import { RefreshHandler } from './refresh';

const now = new Date('2026-07-12T12:00:00.000Z');
const future = new Date('2026-07-26T12:00:00.000Z');
const clock: Clock = { now: () => now };
const familyId = TokenFamilyId.fromString('family-1');
const sessionId = SessionId.fromString('session-1');
const userId = UserId.fromString('user-1');
const PRESENTED = 'presented-token';
const PRESENTED_HASH = `hash:${PRESENTED}`;

const issued: IssuedAccessToken = {
  token: 'new.access.jwt',
  jti: 'jti-1',
  expiresAt: new Date(now.getTime() + 900_000),
  expiresInSeconds: 900,
};
const accessTokens: AccessTokenIssuer = { issue: () => Promise.resolve(issued) };
const generator: RefreshTokenGenerator = {
  generate: () => ({ raw: 'successor-raw', hash: 'successor-hash' }),
  hash: (raw) => `hash:${raw}`,
};

const refreshToken = (status: RefreshTokenStatus, generation: number): RefreshToken => ({
  id: `rt-${generation}`,
  familyId,
  tokenHash: PRESENTED_HASH,
  generation,
  status,
  createdAt: now,
  expiresAt: future,
  consumedAt: null,
});

const family = (status: TokenFamilyStatus): TokenFamily => ({
  id: familyId,
  userId,
  sessionId,
  status,
  createdAt: now,
  revokedAt: null,
  revokedReason: null,
});

const session = (status: 'active' | 'revoked', expiresAt: Date): Session => ({
  id: sessionId,
  userId,
  status,
  deviceLabel: null,
  userAgent: null,
  ip: null,
  createdAt: now,
  lastSeenAt: now,
  expiresAt,
  revokedAt: null,
});

class FakeRefreshTokens implements RefreshTokensRepository {
  byHash: RefreshToken | null = null;
  active: RefreshToken | null = null;
  rotateResult = true;
  readonly added: RefreshToken[] = [];
  add(token: RefreshToken): Promise<void> {
    this.added.push(token);
    return Promise.resolve();
  }
  findByHash(): Promise<RefreshToken | null> {
    return Promise.resolve(this.byHash);
  }
  findActiveByFamily(): Promise<RefreshToken | null> {
    return Promise.resolve(this.active);
  }
  rotate(): Promise<boolean> {
    return Promise.resolve(this.rotateResult);
  }
}

class FakeFamilies implements TokenFamiliesRepository {
  family: TokenFamily | null = null;
  reuseCalls = 0;
  create(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<TokenFamily | null> {
    return Promise.resolve(this.family);
  }
  revoke(): Promise<void> {
    return Promise.resolve();
  }
  revokeForReuse(): Promise<void> {
    this.reuseCalls += 1;
    return Promise.resolve();
  }
  revokeBySession(): Promise<void> {
    return Promise.resolve();
  }
  revokeAllForUser(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeSessions implements SessionsRepository {
  session: Session | null = null;
  create(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<Session | null> {
    return Promise.resolve(this.session);
  }
  revoke(): Promise<void> {
    return Promise.resolve();
  }
  revokeAllForUser(): Promise<string[]> {
    return Promise.resolve([]);
  }
  listActiveByUser(): Promise<Session[]> {
    return Promise.resolve([]);
  }
  touch(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeGraceCache implements RefreshGraceCache {
  readonly store = new Map<string, GracePair>();
  get(hash: string): Promise<GracePair | null> {
    return Promise.resolve(this.store.get(hash) ?? null);
  }
  put(hash: string, pair: GracePair): Promise<void> {
    this.store.set(hash, pair);
    return Promise.resolve();
  }
}

const setup = () => {
  const refreshTokens = new FakeRefreshTokens();
  const families = new FakeFamilies();
  const sessions = new FakeSessions();
  const grace = new FakeGraceCache();
  refreshTokens.byHash = refreshToken('active', 1);
  families.family = family('active');
  sessions.session = session('active', future);
  const handler = new RefreshHandler(
    refreshTokens,
    families,
    sessions,
    accessTokens,
    generator,
    grace,
    clock,
    { graceSeconds: 10 },
  );
  return { handler, refreshTokens, families, sessions, grace };
};

describe('RefreshHandler', () => {
  it('rotates a valid token: new pair, successor persisted, family preserved', async () => {
    const { handler, refreshTokens, families, grace } = setup();

    const result = await handler.execute({ refreshToken: PRESENTED });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      accessToken: 'new.access.jwt',
      refreshToken: 'successor-raw',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(families.reuseCalls).toBe(0);
    expect(grace.store.get(PRESENTED_HASH)?.successorGeneration).toBe(2);
    expect(refreshTokens.rotateResult).toBe(true);
  });

  it('revokes the family and flags reuse when an already-rotated token is replayed', async () => {
    const { handler, refreshTokens, families } = setup();
    refreshTokens.byHash = refreshToken('rotated', 1);

    const result = await handler.execute({ refreshToken: PRESENTED });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('reuse');
    expect(families.reuseCalls).toBe(1);
  });

  it('returns the same pair for a benign replay within the grace window', async () => {
    const { handler, refreshTokens, families, grace } = setup();
    refreshTokens.byHash = refreshToken('rotated', 1);
    refreshTokens.active = refreshToken('active', 2);
    grace.store.set(PRESENTED_HASH, {
      accessToken: 'cached.access',
      refreshToken: 'cached-refresh',
      expiresIn: 900,
      successorGeneration: 2,
    });

    const result = await handler.execute({ refreshToken: PRESENTED });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refreshToken).toBe('cached-refresh');
    expect(families.reuseCalls).toBe(0);
  });

  it('returns the winner pair when a concurrent rotate loses the race', async () => {
    const { handler, refreshTokens, families, grace } = setup();
    refreshTokens.rotateResult = false;
    refreshTokens.active = refreshToken('active', 2);
    grace.store.set(PRESENTED_HASH, {
      accessToken: 'winner.access',
      refreshToken: 'winner-refresh',
      expiresIn: 900,
      successorGeneration: 2,
    });

    const result = await handler.execute({ refreshToken: PRESENTED });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refreshToken).toBe('winner-refresh');
    expect(families.reuseCalls).toBe(0);
  });

  it('treats a superseded grace entry as reuse (no chain-walking)', async () => {
    const { handler, refreshTokens, families, grace } = setup();
    refreshTokens.byHash = refreshToken('rotated', 1);
    refreshTokens.active = refreshToken('active', 3);
    grace.store.set(PRESENTED_HASH, {
      accessToken: 'stale.access',
      refreshToken: 'stale-refresh',
      expiresIn: 900,
      successorGeneration: 2,
    });

    const result = await handler.execute({ refreshToken: PRESENTED });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('reuse');
    expect(families.reuseCalls).toBe(1);
  });

  it('rejects an unknown, revoked-family, or expired-session token', async () => {
    const missing = setup();
    missing.refreshTokens.byHash = null;
    expect((await missing.handler.execute({ refreshToken: PRESENTED })).ok).toBe(false);

    const revokedFamily = setup();
    revokedFamily.families.family = family('revoked');
    const r2 = await revokedFamily.handler.execute({ refreshToken: PRESENTED });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('invalid');

    const deadSession = setup();
    deadSession.sessions.session = session('active', new Date(now.getTime() - 1000));
    const r3 = await deadSession.handler.execute({ refreshToken: PRESENTED });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error).toBe('invalid');
  });
});
