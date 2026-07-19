import { forwardRef, Module } from '@nestjs/common';
import { AuthnModule } from '../authn/authn.module';
import { ENV } from '../config/env.module';
import { type Env } from '../config/env';
import { DB, type Database } from '../db/db.module';
import { RegisterUserHandler, REGISTER_USER_HANDLER } from './application/register-user';
import {
  RequestPasswordResetHandler,
  REQUEST_PASSWORD_RESET_HANDLER,
} from './application/request-password-reset';
import { ResetPasswordHandler, RESET_PASSWORD_HANDLER } from './application/reset-password';
import { VerifyEmailHandler, VERIFY_EMAIL_HANDLER } from './application/verify-email';
import { CLOCK, type Clock } from '../shared/kernel/clock';
import { HASHER, type Hasher } from './domain/ports/hasher';
import { MAILER, type Mailer } from './domain/ports/mailer';
import { MFA_CREDENTIALS_REPOSITORY } from './domain/ports/mfa-credentials-repository';
import { RECOVERY_CODES_REPOSITORY } from './domain/ports/recovery-codes-repository';
import { SECRET_ENCRYPTOR, type SecretEncryptor } from './domain/ports/secret-encryptor';
import { TOTP } from './domain/ports/totp';
import {
  PASSWORD_RESET_TOKENS_REPOSITORY,
  type PasswordResetTokensRepository,
} from './domain/ports/password-reset-tokens-repository';
import { SESSION_REVOKER, type SessionRevoker } from './domain/ports/session-revoker';
import { TOKEN_GENERATOR, type TokenGenerator } from './domain/ports/token-generator';
import { USERS_REPOSITORY, type UsersRepository } from './domain/ports/users-repository';
import {
  VERIFICATION_TOKENS_REPOSITORY,
  type VerificationTokensRepository,
} from './domain/ports/verification-tokens-repository';
import { SystemClock } from '../shared/kernel/system-clock';
import { Argon2Hasher } from './infrastructure/crypto/argon2-hasher';
import { CryptoTokenGenerator } from './infrastructure/crypto/crypto-token-generator';
import { Rfc6238Totp } from './infrastructure/crypto/rfc6238-totp';
import { SoftwareSecretEncryptor } from './infrastructure/crypto/software-secret-encryptor';
import { VaultTransitSecretEncryptor } from './infrastructure/crypto/vault-transit-secret-encryptor';
import { LogMailer } from './infrastructure/notifications/log-mailer';
import { DrizzleMfaCredentialsRepository } from './infrastructure/persistence/drizzle-mfa-credentials.repository';
import { DrizzlePasswordResetTokensRepository } from './infrastructure/persistence/drizzle-password-reset-tokens.repository';
import { DrizzleRecoveryCodesRepository } from './infrastructure/persistence/drizzle-recovery-codes.repository';
import { DrizzleUsersRepository } from './infrastructure/persistence/drizzle-users.repository';
import { DrizzleVerificationTokensRepository } from './infrastructure/persistence/drizzle-verification-tokens.repository';
import { AuthController } from './interface/auth.controller';

@Module({
  imports: [forwardRef(() => AuthnModule)],
  controllers: [AuthController],
  providers: [
    { provide: HASHER, useClass: Argon2Hasher },
    { provide: CLOCK, useClass: SystemClock },
    { provide: TOKEN_GENERATOR, useClass: CryptoTokenGenerator },
    { provide: MAILER, useClass: LogMailer },
    { provide: TOTP, useClass: Rfc6238Totp },
    {
      provide: SECRET_ENCRYPTOR,
      inject: [ENV],
      useFactory: (env: Env): SecretEncryptor =>
        env.SIGNER_DRIVER === 'software'
          ? new SoftwareSecretEncryptor()
          : new VaultTransitSecretEncryptor({
              addr: env.VAULT_ADDR,
              token: env.VAULT_TOKEN,
              keyName: env.VAULT_TRANSIT_MFA_KEY,
            }),
    },
    {
      provide: MFA_CREDENTIALS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleMfaCredentialsRepository =>
        new DrizzleMfaCredentialsRepository(db),
    },
    {
      provide: RECOVERY_CODES_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleRecoveryCodesRepository =>
        new DrizzleRecoveryCodesRepository(db),
    },
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
      provide: PASSWORD_RESET_TOKENS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzlePasswordResetTokensRepository =>
        new DrizzlePasswordResetTokensRepository(db),
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
    {
      provide: VERIFY_EMAIL_HANDLER,
      inject: [USERS_REPOSITORY, VERIFICATION_TOKENS_REPOSITORY, TOKEN_GENERATOR, CLOCK],
      useFactory: (
        users: UsersRepository,
        verificationTokens: VerificationTokensRepository,
        tokenGenerator: TokenGenerator,
        clock: Clock,
      ): VerifyEmailHandler =>
        new VerifyEmailHandler(users, verificationTokens, tokenGenerator, clock),
    },
    {
      provide: REQUEST_PASSWORD_RESET_HANDLER,
      inject: [USERS_REPOSITORY, PASSWORD_RESET_TOKENS_REPOSITORY, TOKEN_GENERATOR, MAILER, CLOCK],
      useFactory: (
        users: UsersRepository,
        passwordResetTokens: PasswordResetTokensRepository,
        tokenGenerator: TokenGenerator,
        mailer: Mailer,
        clock: Clock,
      ): RequestPasswordResetHandler =>
        new RequestPasswordResetHandler(users, passwordResetTokens, tokenGenerator, mailer, clock),
    },
    {
      provide: RESET_PASSWORD_HANDLER,
      inject: [
        USERS_REPOSITORY,
        PASSWORD_RESET_TOKENS_REPOSITORY,
        HASHER,
        TOKEN_GENERATOR,
        SESSION_REVOKER,
        CLOCK,
      ],
      useFactory: (
        users: UsersRepository,
        passwordResetTokens: PasswordResetTokensRepository,
        hasher: Hasher,
        tokenGenerator: TokenGenerator,
        sessionRevoker: SessionRevoker,
        clock: Clock,
      ): ResetPasswordHandler =>
        new ResetPasswordHandler(
          users,
          passwordResetTokens,
          hasher,
          tokenGenerator,
          sessionRevoker,
          clock,
        ),
    },
  ],
  exports: [
    HASHER,
    USERS_REPOSITORY,
    TOTP,
    SECRET_ENCRYPTOR,
    MFA_CREDENTIALS_REPOSITORY,
    RECOVERY_CODES_REPOSITORY,
  ],
})
export class IdentityModule {}
