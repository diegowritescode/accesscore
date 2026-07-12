import {
  type AccessTokenIssuer,
  type IssuedAccessToken,
} from '../domain/ports/access-token-issuer';
import { type Clock } from '../domain/ports/clock';
import { type CredentialCheck, type Credentials } from '../domain/ports/credentials';
import { type RefreshTokenGenerator } from '../domain/ports/refresh-token-generator';
import { type RefreshTokensRepository } from '../domain/ports/refresh-tokens-repository';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type TokenFamiliesRepository } from '../domain/ports/token-families-repository';
import { type RefreshToken } from '../domain/refresh-token';
import { type Session } from '../domain/session';
import { type TokenFamily } from '../domain/token-family';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { LoginHandler } from './login';

const unitOfWork: UnitOfWork = { withTransaction: (work) => work({ executor: {} }) };

const now = new Date('2026-07-12T12:00:00.000Z');
const clock: Clock = { now: () => now };

const issued: IssuedAccessToken = {
  token: 'access.jwt.token',
  jti: 'jti-1',
  expiresAt: new Date(now.getTime() + 900_000),
  expiresInSeconds: 900,
};
const accessTokens: AccessTokenIssuer = { issue: () => Promise.resolve(issued) };

const refreshTokenGenerator: RefreshTokenGenerator = {
  generate: () => ({ raw: 'refresh-raw', hash: 'refresh-hash' }),
  hash: (raw) => `hash:${raw}`,
};

class FakeSessions implements SessionsRepository {
  readonly created: Session[] = [];
  create(session: Session): Promise<void> {
    this.created.push(session);
    return Promise.resolve();
  }
  findById(): Promise<Session | null> {
    return Promise.resolve(null);
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

class FakeFamilies implements TokenFamiliesRepository {
  readonly created: TokenFamily[] = [];
  create(family: TokenFamily): Promise<void> {
    this.created.push(family);
    return Promise.resolve();
  }
  findById(): Promise<TokenFamily | null> {
    return Promise.resolve(null);
  }
  revoke(): Promise<void> {
    return Promise.resolve();
  }
  revokeForReuse(): Promise<void> {
    return Promise.resolve();
  }
  revokeBySession(): Promise<void> {
    return Promise.resolve();
  }
  revokeAllForUser(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeRefreshTokens implements RefreshTokensRepository {
  readonly added: RefreshToken[] = [];
  add(token: RefreshToken): Promise<void> {
    this.added.push(token);
    return Promise.resolve();
  }
  findByHash(): Promise<RefreshToken | null> {
    return Promise.resolve(null);
  }
  findActiveByFamily(): Promise<RefreshToken | null> {
    return Promise.resolve(null);
  }
  rotate(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

const build = (check: CredentialCheck | null) => {
  const sessions = new FakeSessions();
  const families = new FakeFamilies();
  const refreshTokens = new FakeRefreshTokens();
  const credentials: Credentials = { verify: () => Promise.resolve(check) };
  const handler = new LoginHandler(
    credentials,
    sessions,
    families,
    refreshTokens,
    accessTokens,
    refreshTokenGenerator,
    unitOfWork,
    clock,
    { refreshTtlSeconds: 1_000 },
  );
  return { handler, sessions, families, refreshTokens };
};

describe('LoginHandler', () => {
  it('issues tokens and creates a session, family, and refresh token on valid credentials', async () => {
    const { handler, sessions, families, refreshTokens } = build({ userId: 'user-1', aal: 1 });

    const result = await handler.execute({
      email: 'a@b.com',
      password: 'correct horse battery',
      userAgent: 'AccessCore/1.0',
      ip: '203.0.113.7',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      accessToken: 'access.jwt.token',
      refreshToken: 'refresh-raw',
      tokenType: 'Bearer',
      expiresIn: 900,
    });

    expect(sessions.created).toHaveLength(1);
    expect(sessions.created[0]?.userId.value).toBe('user-1');
    expect(sessions.created[0]?.userAgent).toBe('AccessCore/1.0');
    expect(sessions.created[0]?.ip).toBe('203.0.113.7');

    expect(families.created).toHaveLength(1);
    expect(families.created[0]?.sessionId.value).toBe(sessions.created[0]?.id.value);

    expect(refreshTokens.added).toHaveLength(1);
    expect(refreshTokens.added[0]?.generation).toBe(1);
    expect(refreshTokens.added[0]?.tokenHash).toBe('refresh-hash');
    expect(refreshTokens.added[0]?.familyId.value).toBe(families.created[0]?.id.value);
  });

  it('returns invalid_credentials and persists nothing when the credential check fails', async () => {
    const { handler, sessions, families, refreshTokens } = build(null);

    const result = await handler.execute({
      email: 'a@b.com',
      password: 'wrong',
      userAgent: null,
      ip: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_credentials');
    expect(sessions.created).toHaveLength(0);
    expect(families.created).toHaveLength(0);
    expect(refreshTokens.added).toHaveLength(0);
  });
});
