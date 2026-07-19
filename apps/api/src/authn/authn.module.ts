import { forwardRef, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../db/db.module';
import {
  REDEEM_RECOVERY_CODE_HANDLER,
  type RedeemRecoveryCodeHandler,
} from '../identity/application/redeem-recovery-code';
import { HASHER, type Hasher } from '../identity/domain/ports/hasher';
import {
  MFA_CREDENTIALS_REPOSITORY,
  type MfaCredentialsRepository,
} from '../identity/domain/ports/mfa-credentials-repository';
import { SECRET_ENCRYPTOR, type SecretEncryptor } from '../identity/domain/ports/secret-encryptor';
import { SESSION_REVOKER } from '../identity/domain/ports/session-revoker';
import { TOTP, type Totp } from '../identity/domain/ports/totp';
import { USERS_REPOSITORY, type UsersRepository } from '../identity/domain/ports/users-repository';
import { IdentityModule } from '../identity/identity.module';
import { REDIS } from '../redis/redis.module';
import { UNIT_OF_WORK, type UnitOfWork } from '../shared/persistence/unit-of-work';
import { TENANCY_SERVICE, type TenancyService } from '../tenancy/application/tenancy-service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { LIST_SESSIONS_HANDLER, ListSessionsHandler } from './application/list-sessions';
import { LOGIN_HANDLER, LoginHandler } from './application/login';
import { REFRESH_HANDLER, RefreshHandler } from './application/refresh';
import { REVOKE_SESSION_HANDLER, RevokeSessionHandler } from './application/revoke-session';
import { SESSION_TERMINATOR, SessionTerminator } from './application/session-terminator';
import { SIGNING_KEYS, SigningKeyService } from './application/signing-keys';
import { STEP_UP_HANDLER, StepUpHandler } from './application/step-up';
import { ACCESS_TOKEN_ISSUER, type AccessTokenIssuer } from './domain/ports/access-token-issuer';
import { CLOCK, type Clock } from '../shared/kernel/clock';
import { CREDENTIALS, type Credentials } from './domain/ports/credentials';
import { REFRESH_GRACE_CACHE, type RefreshGraceCache } from './domain/ports/refresh-grace-cache';
import { REFRESH_TOKEN_GENERATOR } from './domain/ports/refresh-token-generator';
import type { RefreshTokenGenerator } from './domain/ports/refresh-token-generator';
import { REFRESH_TOKENS_REPOSITORY } from './domain/ports/refresh-tokens-repository';
import type { RefreshTokensRepository } from './domain/ports/refresh-tokens-repository';
import { REVOCATION_STORE, type RevocationStore } from './domain/ports/revocation-store';
import { SECOND_FACTOR, type SecondFactor } from './domain/ports/second-factor';
import { SESSIONS_REPOSITORY } from './domain/ports/sessions-repository';
import type { SessionsRepository } from './domain/ports/sessions-repository';
import { SIGNER, type Signer } from './domain/ports/signer';
import { SIGNING_KEY_STATE, type SigningKeyState } from './domain/ports/signing-key-state';
import { TOKEN_FAMILIES_REPOSITORY } from './domain/ports/token-families-repository';
import type { TokenFamiliesRepository } from './domain/ports/token-families-repository';
import { type TokenSigner } from './domain/ports/token-signer';
import { RedisRefreshGraceCache } from './infrastructure/cache/redis-refresh-grace-cache';
import { SystemClock } from '../shared/kernel/system-clock';
import { IdentityCredentials } from './infrastructure/credentials/identity-credentials';
import { IdentitySecondFactor } from './infrastructure/credentials/identity-second-factor';
import { AuthnSessionRevoker } from './infrastructure/session/authn-session-revoker';
import { JWKS_PROVIDER, JwksProvider } from './infrastructure/jwks/jwks-provider';
import { AppMetaSigningKeyState } from './infrastructure/persistence/app-meta-signing-key-state.repository';
import { DrizzleRefreshTokensRepository } from './infrastructure/persistence/drizzle-refresh-tokens.repository';
import { DrizzleSessionsRepository } from './infrastructure/persistence/drizzle-sessions.repository';
import { DrizzleTokenFamiliesRepository } from './infrastructure/persistence/drizzle-token-families.repository';
import { RedisRevocationStore } from './infrastructure/revocation/redis-revocation-store';
import { SoftwareSigner } from './infrastructure/signing/software-signer';
import { VaultTransitSigner } from './infrastructure/signing/vault-transit-signer';
import { JwtAccessTokenIssuer } from './infrastructure/tokens/jwt-access-token-issuer';
import { JWT_VERIFIER, JwtVerifier } from './infrastructure/tokens/jwt-verifier';
import { Sha256RefreshTokenGenerator } from './infrastructure/tokens/sha256-refresh-token-generator';
import { AccessTokenGuard } from './interface/access-token.guard';
import { AuthnController } from './interface/authn.controller';
import { JwksController } from './interface/jwks.controller';

@Module({
  imports: [forwardRef(() => IdentityModule), TenancyModule],
  controllers: [AuthnController, JwksController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: REFRESH_TOKEN_GENERATOR, useClass: Sha256RefreshTokenGenerator },
    {
      provide: SIGNER,
      inject: [ENV],
      useFactory: (env: Env): Signer =>
        env.SIGNER_DRIVER === 'software'
          ? new SoftwareSigner()
          : new VaultTransitSigner({
              addr: env.VAULT_ADDR,
              token: env.VAULT_TOKEN,
              keyName: env.VAULT_TRANSIT_KEY,
            }),
    },
    {
      provide: SIGNING_KEY_STATE,
      inject: [DB],
      useFactory: (db: Database): AppMetaSigningKeyState => new AppMetaSigningKeyState(db),
    },
    {
      provide: SIGNING_KEYS,
      inject: [SIGNER, SIGNING_KEY_STATE, CLOCK, ENV],
      useFactory: (
        signer: Signer,
        state: SigningKeyState,
        clock: Clock,
        env: Env,
      ): SigningKeyService =>
        new SigningKeyService(signer, state, clock, {
          accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL,
        }),
    },
    {
      provide: JWKS_PROVIDER,
      inject: [SIGNER, CLOCK, ENV],
      useFactory: (signer: Signer, clock: Clock, env: Env): JwksProvider =>
        new JwksProvider(signer, clock, env.JWKS_CACHE_MAX_AGE),
    },
    {
      provide: JWT_VERIFIER,
      inject: [JWKS_PROVIDER, CLOCK, ENV],
      useFactory: (jwks: JwksProvider, clock: Clock, env: Env): JwtVerifier =>
        new JwtVerifier(jwks, clock, {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          clockSkewSeconds: env.JWT_CLOCK_SKEW,
        }),
    },
    {
      provide: REVOCATION_STORE,
      inject: [REDIS],
      useFactory: (redis: Redis): RedisRevocationStore => new RedisRevocationStore(redis),
    },
    {
      provide: REFRESH_GRACE_CACHE,
      inject: [REDIS],
      useFactory: (redis: Redis): RedisRefreshGraceCache => new RedisRefreshGraceCache(redis),
    },
    {
      provide: SESSIONS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleSessionsRepository => new DrizzleSessionsRepository(db),
    },
    {
      provide: TOKEN_FAMILIES_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleTokenFamiliesRepository =>
        new DrizzleTokenFamiliesRepository(db),
    },
    {
      provide: REFRESH_TOKENS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleRefreshTokensRepository =>
        new DrizzleRefreshTokensRepository(db),
    },
    {
      provide: CREDENTIALS,
      inject: [USERS_REPOSITORY, HASHER, MFA_CREDENTIALS_REPOSITORY],
      useFactory: (
        users: UsersRepository,
        hasher: Hasher,
        mfaCredentials: MfaCredentialsRepository,
      ): IdentityCredentials => new IdentityCredentials(users, hasher, mfaCredentials),
    },
    {
      provide: SECOND_FACTOR,
      inject: [
        MFA_CREDENTIALS_REPOSITORY,
        SECRET_ENCRYPTOR,
        TOTP,
        REDEEM_RECOVERY_CODE_HANDLER,
        CLOCK,
      ],
      useFactory: (
        mfaCredentials: MfaCredentialsRepository,
        encryptor: SecretEncryptor,
        totp: Totp,
        redeem: RedeemRecoveryCodeHandler,
        clock: Clock,
      ): IdentitySecondFactor =>
        new IdentitySecondFactor(mfaCredentials, encryptor, totp, redeem, clock),
    },
    {
      provide: STEP_UP_HANDLER,
      inject: [SESSIONS_REPOSITORY, SECOND_FACTOR, ACCESS_TOKEN_ISSUER, CLOCK],
      useFactory: (
        sessions: SessionsRepository,
        secondFactor: SecondFactor,
        accessTokens: AccessTokenIssuer,
        clock: Clock,
      ): StepUpHandler => new StepUpHandler(sessions, secondFactor, accessTokens, clock),
    },
    {
      provide: ACCESS_TOKEN_ISSUER,
      inject: [SIGNING_KEYS, CLOCK, ENV],
      useFactory: (tokenSigner: TokenSigner, clock: Clock, env: Env): JwtAccessTokenIssuer =>
        new JwtAccessTokenIssuer(tokenSigner, clock, {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          ttlSeconds: env.ACCESS_TOKEN_TTL,
        }),
    },
    {
      provide: LOGIN_HANDLER,
      inject: [
        CREDENTIALS,
        SESSIONS_REPOSITORY,
        TOKEN_FAMILIES_REPOSITORY,
        REFRESH_TOKENS_REPOSITORY,
        ACCESS_TOKEN_ISSUER,
        REFRESH_TOKEN_GENERATOR,
        TENANCY_SERVICE,
        UNIT_OF_WORK,
        CLOCK,
        ENV,
      ],
      useFactory: (
        credentials: Credentials,
        sessions: SessionsRepository,
        tokenFamilies: TokenFamiliesRepository,
        refreshTokens: RefreshTokensRepository,
        accessTokens: AccessTokenIssuer,
        refreshTokenGenerator: RefreshTokenGenerator,
        tenancy: TenancyService,
        unitOfWork: UnitOfWork,
        clock: Clock,
        env: Env,
      ): LoginHandler =>
        new LoginHandler(
          credentials,
          sessions,
          tokenFamilies,
          refreshTokens,
          accessTokens,
          refreshTokenGenerator,
          tenancy,
          unitOfWork,
          clock,
          { refreshTtlSeconds: env.REFRESH_TOKEN_TTL },
        ),
    },
    {
      provide: REFRESH_HANDLER,
      inject: [
        REFRESH_TOKENS_REPOSITORY,
        TOKEN_FAMILIES_REPOSITORY,
        SESSIONS_REPOSITORY,
        ACCESS_TOKEN_ISSUER,
        REFRESH_TOKEN_GENERATOR,
        REFRESH_GRACE_CACHE,
        REVOCATION_STORE,
        CLOCK,
        ENV,
      ],
      useFactory: (
        refreshTokens: RefreshTokensRepository,
        tokenFamilies: TokenFamiliesRepository,
        sessions: SessionsRepository,
        accessTokens: AccessTokenIssuer,
        refreshTokenGenerator: RefreshTokenGenerator,
        graceCache: RefreshGraceCache,
        revocation: RevocationStore,
        clock: Clock,
        env: Env,
      ): RefreshHandler =>
        new RefreshHandler(
          refreshTokens,
          tokenFamilies,
          sessions,
          accessTokens,
          refreshTokenGenerator,
          graceCache,
          revocation,
          clock,
          { graceSeconds: env.REFRESH_GRACE_SECONDS, accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL },
        ),
    },
    {
      provide: SESSION_TERMINATOR,
      inject: [
        SESSIONS_REPOSITORY,
        TOKEN_FAMILIES_REPOSITORY,
        REVOCATION_STORE,
        UNIT_OF_WORK,
        CLOCK,
        ENV,
      ],
      useFactory: (
        sessions: SessionsRepository,
        tokenFamilies: TokenFamiliesRepository,
        revocation: RevocationStore,
        unitOfWork: UnitOfWork,
        clock: Clock,
        env: Env,
      ): SessionTerminator =>
        new SessionTerminator(sessions, tokenFamilies, revocation, unitOfWork, clock, {
          accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL,
        }),
    },
    {
      provide: SESSION_REVOKER,
      inject: [SESSION_TERMINATOR],
      useFactory: (terminator: SessionTerminator): AuthnSessionRevoker =>
        new AuthnSessionRevoker(terminator),
    },
    {
      provide: LIST_SESSIONS_HANDLER,
      inject: [SESSIONS_REPOSITORY],
      useFactory: (sessions: SessionsRepository): ListSessionsHandler =>
        new ListSessionsHandler(sessions),
    },
    {
      provide: REVOKE_SESSION_HANDLER,
      inject: [SESSIONS_REPOSITORY, SESSION_TERMINATOR],
      useFactory: (
        sessions: SessionsRepository,
        terminator: SessionTerminator,
      ): RevokeSessionHandler => new RevokeSessionHandler(sessions, terminator),
    },
    AccessTokenGuard,
  ],
  exports: [
    SIGNER,
    SIGNING_KEYS,
    JWKS_PROVIDER,
    JWT_VERIFIER,
    REVOCATION_STORE,
    SESSION_REVOKER,
    SESSION_TERMINATOR,
    SESSIONS_REPOSITORY,
    TOKEN_FAMILIES_REPOSITORY,
    REFRESH_TOKENS_REPOSITORY,
  ],
})
export class AuthnModule {}
