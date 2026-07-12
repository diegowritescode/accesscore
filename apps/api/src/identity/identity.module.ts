import { Module } from '@nestjs/common';
import { DB, type Database } from '../db/db.module';
import { HASHER } from './domain/ports/hasher';
import { USERS_REPOSITORY } from './domain/ports/users-repository';
import { Argon2Hasher } from './infrastructure/crypto/argon2-hasher';
import { DrizzleUsersRepository } from './infrastructure/persistence/drizzle-users.repository';

@Module({
  providers: [
    { provide: HASHER, useClass: Argon2Hasher },
    {
      provide: USERS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleUsersRepository => new DrizzleUsersRepository(db),
    },
  ],
  exports: [HASHER, USERS_REPOSITORY],
})
export class IdentityModule {}
