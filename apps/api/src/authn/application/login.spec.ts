import {
  type AccessTokenIssuer,
  type IssuedAccessToken,
} from '../domain/ports/access-token-issuer';
import { type Clock } from '../../shared/kernel/clock';
import { type CredentialCheck, type Credentials } from '../domain/ports/credentials';
import { type LockoutStore } from '../domain/ports/lockout-store';
import { type RefreshTokenGenerator } from '../domain/ports/refresh-token-generator';
import { type RefreshTokensRepository } from '../domain/ports/refresh-tokens-repository';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type TokenFamiliesRepository } from '../domain/ports/token-families-repository';
import { type RefreshToken } from '../domain/refresh-token';
import { type Session } from '../domain/session';
import { type TokenFamily } from '../domain/token-family';
import { OrgId } from '../../shared/kernel/org-id';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type TenancyService } from '../../tenancy/application/tenancy-service';
import { LoginHandler } from './login';

const unitOfWork: UnitOfWork = { withTransaction: (work) => work({ executor: {} }) };
const tenancy = {
  findActiveOrganization: () => Promise.resolve(OrgId.fromString('org-1')),
} as unknown as TenancyService;

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
  elevate(): Promise<boolean> {
    return Promise.resolve(true);
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

interface RecordingLockout extends LockoutStore {
  failures: string[];
  resets: string[];
  lockedKeys: Set<string>;
}

const recordingLockout = (): RecordingLockout => {
  const failures: string[] = [];
  const resets: string[] = [];
  const lockedKeys = new Set<string>();
  return {
    failures,
    resets,
    lockedKeys,
    isLocked: (key) => Promise.resolve(lockedKeys.has(key)),
    registerFailure: (key) => {
      failures.push(key);
      return Promise.resolve({ locked: false, retriesLeft: 5 });
    },
    reset: (key) => {
      resets.push(key);
      return Promise.resolve();
    },
  };
};

const build = (check: CredentialCheck | null, lockout: RecordingLockout = recordingLockout()) => {
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
    tenancy,
    unitOfWork,
    lockout,
    clock,
    {
      refreshTtlSeconds: 1_000,
      accountLockout: { threshold: 5, windowSeconds: 900 },
      ipLockout: { threshold: 50, windowSeconds: 900 },
    },
  );
  return { handler, sessions, families, refreshTokens, lockout };
};

describe('LoginHandler', () => {
  it('issues tokens and creates a session, family, and refresh token on valid credentials', async () => {
    const { handler, sessions, families, refreshTokens, lockout } = build({
      userId: 'user-1',
      aal: 1,
      mfaRequired: false,
    });

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
    expect(sessions.created[0]?.orgId?.value).toBe('org-1');
    expect(sessions.created[0]?.aal).toBe(1);
    expect(sessions.created[0]?.userAgent).toBe('AccessCore/1.0');
    expect(sessions.created[0]?.ip).toBe('203.0.113.7');

    expect(families.created).toHaveLength(1);
    expect(families.created[0]?.sessionId.value).toBe(sessions.created[0]?.id.value);

    expect(refreshTokens.added).toHaveLength(1);
    expect(refreshTokens.added[0]?.generation).toBe(1);
    expect(refreshTokens.added[0]?.tokenHash).toBe('refresh-hash');
    expect(refreshTokens.added[0]?.familyId.value).toBe(families.created[0]?.id.value);
    expect(lockout.resets).toEqual(expect.arrayContaining(['acct:a@b.com', 'ip:203.0.113.7']));
  });

  it('returns invalid_credentials, registers a failure, and persists nothing', async () => {
    const { handler, sessions, families, refreshTokens, lockout } = build(null);

    const result = await handler.execute({
      email: 'a@b.com',
      password: 'wrong',
      userAgent: null,
      ip: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_credentials');
    expect(lockout.failures).toContain('acct:a@b.com');
    expect(sessions.created).toHaveLength(0);
    expect(families.created).toHaveLength(0);
    expect(refreshTokens.added).toHaveLength(0);
  });

  it('returns locked without verifying when the account is locked', async () => {
    const lockout = recordingLockout();
    lockout.lockedKeys.add('acct:a@b.com');
    let verified = false;
    const sessions = new FakeSessions();
    const handler = new LoginHandler(
      {
        verify: () => (
          (verified = true),
          Promise.resolve({ userId: 'u', aal: 1, mfaRequired: false })
        ),
      },
      sessions,
      new FakeFamilies(),
      new FakeRefreshTokens(),
      accessTokens,
      refreshTokenGenerator,
      tenancy,
      unitOfWork,
      lockout,
      clock,
      {
        refreshTtlSeconds: 1_000,
        accountLockout: { threshold: 5, windowSeconds: 900 },
        ipLockout: { threshold: 50, windowSeconds: 900 },
      },
    );

    const result = await handler.execute({
      email: 'a@b.com',
      password: 'correct horse battery',
      userAgent: null,
      ip: '203.0.113.7',
    });

    expect(result).toEqual({ ok: false, error: 'locked' });
    expect(verified).toBe(false);
    expect(sessions.created).toHaveLength(0);
  });
});
