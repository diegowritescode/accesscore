import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../db/db.module';
import { HASHER, type Hasher } from '../identity/domain/ports/hasher';
import { USERS_REPOSITORY, type UsersRepository } from '../identity/domain/ports/users-repository';
import { IdentityModule } from '../identity/identity.module';
import { REDIS } from '../redis/redis.module';
import { LOGIN_HANDLER, LoginHandler } from './application/login';
import { SIGNING_KEYS, SigningKeyService } from './application/signing-keys';
import { ACCESS_TOKEN_ISSUER, type AccessTokenIssuer } from './domain/ports/access-token-issuer';
import { CLOCK, type Clock } from './domain/ports/clock';
import { CREDENTIALS, type Credentials } from './domain/ports/credentials';
import { REFRESH_TOKEN_GENERATOR } from './domain/ports/refresh-token-generator';
import type { RefreshTokenGenerator } from './domain/ports/refresh-token-generator';
import { REFRESH_TOKENS_REPOSITORY } from './domain/ports/refresh-tokens-repository';
import type { RefreshTokensRepository } from './domain/ports/refresh-tokens-repository';
import { REVOCATION_STORE } from './domain/ports/revocation-store';
import { SESSIONS_REPOSITORY } from './domain/ports/sessions-repository';
import type { SessionsRepository } from './domain/ports/sessions-repository';
import { SIGNER, type Signer } from './domain/ports/signer';
import { SIGNING_KEY_STATE, type SigningKeyState } from './domain/ports/signing-key-state';
import { TOKEN_FAMILIES_REPOSITORY } from './domain/ports/token-families-repository';
import type { TokenFamiliesRepository } from './domain/ports/token-families-repository';
import { type TokenSigner } from './domain/ports/token-signer';
import { SystemClock } from './infrastructure/clock/system-clock';
import { IdentityCredentials } from './infrastructure/credentials/identity-credentials';
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
import { AuthnController } from './interface/authn.controller';
import { JwksController } from './interface/jwks.controller';

@Module({
  imports: [IdentityModule],
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
      inject: [SIGNER],
      useFactory: (signer: Signer): JwksProvider => new JwksProvider(signer),
    },
    {
      provide: JWT_VERIFIER,
      inject: [JWKS_PROVIDER, CLOCK],
      useFactory: (jwks: JwksProvider, clock: Clock): JwtVerifier => new JwtVerifier(jwks, clock),
    },
    {
      provide: REVOCATION_STORE,
      inject: [REDIS],
      useFactory: (redis: Redis): RedisRevocationStore => new RedisRevocationStore(redis),
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
      inject: [USERS_REPOSITORY, HASHER],
      useFactory: (users: UsersRepository, hasher: Hasher): IdentityCredentials =>
        new IdentityCredentials(users, hasher),
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
          clock,
          { refreshTtlSeconds: env.REFRESH_TOKEN_TTL },
        ),
    },
  ],
  exports: [
    SIGNER,
    SIGNING_KEYS,
    JWKS_PROVIDER,
    JWT_VERIFIER,
    REVOCATION_STORE,
    SESSIONS_REPOSITORY,
    TOKEN_FAMILIES_REPOSITORY,
    REFRESH_TOKENS_REPOSITORY,
  ],
})
export class AuthnModule {}
