import { Module } from '@nestjs/common';
import { DB, type Database } from '../db/db.module';
import { RegisterUserHandler, REGISTER_USER_HANDLER } from './application/register-user';
import { CLOCK, type Clock } from './domain/ports/clock';
import { HASHER, type Hasher } from './domain/ports/hasher';
import { MAILER, type Mailer } from './domain/ports/mailer';
import { TOKEN_GENERATOR, type TokenGenerator } from './domain/ports/token-generator';
import { USERS_REPOSITORY, type UsersRepository } from './domain/ports/users-repository';
import {
  VERIFICATION_TOKENS_REPOSITORY,
  type VerificationTokensRepository,
} from './domain/ports/verification-tokens-repository';
import { SystemClock } from './infrastructure/clock/system-clock';
import { Argon2Hasher } from './infrastructure/crypto/argon2-hasher';
import { CryptoTokenGenerator } from './infrastructure/crypto/crypto-token-generator';
import { LogMailer } from './infrastructure/notifications/log-mailer';
import { DrizzleUsersRepository } from './infrastructure/persistence/drizzle-users.repository';
import { DrizzleVerificationTokensRepository } from './infrastructure/persistence/drizzle-verification-tokens.repository';
import { AuthController } from './interface/auth.controller';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: HASHER, useClass: Argon2Hasher },
    { provide: CLOCK, useClass: SystemClock },
    { provide: TOKEN_GENERATOR, useClass: CryptoTokenGenerator },
    { provide: MAILER, useClass: LogMailer },
    {
      provide: USERS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleUsersRepository => new DrizzleUsersRepository(db),
    },
    {
      provide: VERIFICATION_TOKENS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleVerificationTokensRepository =>
        new DrizzleVerificationTokensRepository(db),
    },
    {
      provide: REGISTER_USER_HANDLER,
      inject: [
        USERS_REPOSITORY,
        VERIFICATION_TOKENS_REPOSITORY,
        HASHER,
        TOKEN_GENERATOR,
        MAILER,
        CLOCK,
      ],
      useFactory: (
        users: UsersRepository,
        verificationTokens: VerificationTokensRepository,
        hasher: Hasher,
        tokenGenerator: TokenGenerator,
        mailer: Mailer,
        clock: Clock,
      ): RegisterUserHandler =>
        new RegisterUserHandler(users, verificationTokens, hasher, tokenGenerator, mailer, clock),
    },
  ],
  exports: [HASHER, USERS_REPOSITORY],
})
export class IdentityModule {}
