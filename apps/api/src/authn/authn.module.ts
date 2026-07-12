import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../db/db.module';
import { REDIS } from '../redis/redis.module';
import { REFRESH_TOKENS_REPOSITORY } from './domain/ports/refresh-tokens-repository';
import { REVOCATION_STORE } from './domain/ports/revocation-store';
import { SESSIONS_REPOSITORY } from './domain/ports/sessions-repository';
import { SIGNER, type Signer } from './domain/ports/signer';
import { TOKEN_FAMILIES_REPOSITORY } from './domain/ports/token-families-repository';
import { JWKS_PROVIDER, JwksProvider } from './infrastructure/jwks/jwks-provider';
import { DrizzleRefreshTokensRepository } from './infrastructure/persistence/drizzle-refresh-tokens.repository';
import { DrizzleSessionsRepository } from './infrastructure/persistence/drizzle-sessions.repository';
import { DrizzleTokenFamiliesRepository } from './infrastructure/persistence/drizzle-token-families.repository';
import { RedisRevocationStore } from './infrastructure/revocation/redis-revocation-store';
import { SoftwareSigner } from './infrastructure/signing/software-signer';
import { VaultTransitSigner } from './infrastructure/signing/vault-transit-signer';

@Module({
  providers: [
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
      provide: JWKS_PROVIDER,
      inject: [SIGNER],
      useFactory: (signer: Signer): JwksProvider => new JwksProvider(signer),
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
  ],
  exports: [
    SIGNER,
    JWKS_PROVIDER,
    REVOCATION_STORE,
    SESSIONS_REPOSITORY,
    TOKEN_FAMILIES_REPOSITORY,
    REFRESH_TOKENS_REPOSITORY,
  ],
})
export class AuthnModule {}
