import { randomUUID } from 'node:crypto';
import { UserId } from '../../shared/kernel/user-id';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { err, ok, type Result } from '../../shared/result';
import { type AccessTokenIssuer } from '../domain/ports/access-token-issuer';
import { type Clock } from '../../shared/kernel/clock';
import { type Credentials } from '../domain/ports/credentials';
import { type LockoutPolicy, type LockoutStore } from '../domain/ports/lockout-store';
import { type RefreshTokenGenerator } from '../domain/ports/refresh-token-generator';
import { type RefreshTokensRepository } from '../domain/ports/refresh-tokens-repository';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type TokenFamiliesRepository } from '../domain/ports/token-families-repository';
import { type TenancyService } from '../../tenancy/application/tenancy-service';
import { SessionId } from '../domain/value-objects/session-id';
import { TokenFamilyId } from '../domain/value-objects/token-family-id';

export interface LoginCommand {
  email: string;
  password: string;
  userAgent: string | null;
  ip: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  mfaRequired: boolean;
}

export interface LoginConfig {
  refreshTtlSeconds: number;
  accountLockout: LockoutPolicy;
  ipLockout: LockoutPolicy;
}

export type LoginError = 'invalid_credentials' | 'locked';

export const LOGIN_HANDLER = Symbol('LOGIN_HANDLER');

export class LoginHandler {
  constructor(
    private readonly credentials: Credentials,
    private readonly sessions: SessionsRepository,
    private readonly tokenFamilies: TokenFamiliesRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly refreshTokenGenerator: RefreshTokenGenerator,
    private readonly tenancy: TenancyService,
    private readonly unitOfWork: UnitOfWork,
    private readonly lockout: LockoutStore,
    private readonly clock: Clock,
    private readonly config: LoginConfig,
  ) {}

  async execute(command: LoginCommand): Promise<Result<LoginResult, LoginError>> {
    const accountKey = `acct:${command.email.trim().toLowerCase()}`;
    const ipKey = command.ip ? `ip:${command.ip}` : null;

    const lockedByAccount = await this.lockout.isLocked(accountKey, this.config.accountLockout);
    const lockedByIp =
      ipKey !== null && (await this.lockout.isLocked(ipKey, this.config.ipLockout));
    if (lockedByAccount || lockedByIp) {
      return err('locked');
    }

    const check = await this.credentials.verify(command.email, command.password);
    if (!check) {
      await this.lockout.registerFailure(accountKey, this.config.accountLockout);
      if (ipKey !== null) {
        await this.lockout.registerFailure(ipKey, this.config.ipLockout);
      }
      return err('invalid_credentials');
    }

    await this.lockout.reset(accountKey);
    if (ipKey !== null) {
      await this.lockout.reset(ipKey);
    }

    const now = this.clock.now();
    const userId = UserId.fromString(check.userId);
    const orgId = await this.tenancy.findActiveOrganization(userId);
    const sessionId = SessionId.generate();
    const familyId = TokenFamilyId.generate();
    const refreshExpiresAt = new Date(now.getTime() + this.config.refreshTtlSeconds * 1000);

    const accessToken = await this.accessTokens.issue({
      sub: check.userId,
      sid: sessionId.value,
      org: orgId?.value ?? null,
      aal: check.aal,
      authTime: now,
    });

    const refresh = this.refreshTokenGenerator.generate();
    await this.unitOfWork.withTransaction(async (tx) => {
      await this.sessions.create(
        {
          id: sessionId,
          userId,
          orgId,
          aal: check.aal,
          authTime: now,
          status: 'active',
          deviceLabel: null,
          userAgent: command.userAgent,
          ip: command.ip,
          createdAt: now,
          lastSeenAt: now,
          expiresAt: refreshExpiresAt,
          revokedAt: null,
        },
        tx,
      );
      await this.tokenFamilies.create(
        {
          id: familyId,
          userId,
          sessionId,
          status: 'active',
          createdAt: now,
          revokedAt: null,
          revokedReason: null,
        },
        tx,
      );
      await this.refreshTokens.add(
        {
          id: randomUUID(),
          familyId,
          tokenHash: refresh.hash,
          generation: 1,
          status: 'active',
          createdAt: now,
          expiresAt: refreshExpiresAt,
          consumedAt: null,
        },
        tx,
      );
    });

    return ok({
      accessToken: accessToken.token,
      refreshToken: refresh.raw,
      tokenType: 'Bearer',
      expiresIn: accessToken.expiresInSeconds,
      mfaRequired: check.mfaRequired,
    });
  }
}
