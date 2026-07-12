import { eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { type UsersRepository } from '../../domain/ports/users-repository';
import { User, type UserStatus } from '../../domain/user';
import { Email } from '../../domain/value-objects/email';
import { PasswordHash } from '../../domain/value-objects/password-hash';
import { UserId } from '../../../shared/kernel/user-id';
import { outbox, users } from './schema';

export class DrizzleUsersRepository implements UsersRepository {
  constructor(private readonly db: Database) {}

  async save(user: User): Promise<void> {
    const events = user.pullEvents();
    await this.db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({
          id: user.id.value,
          email: user.email.value,
          passwordHash: user.passwordHash.value,
          status: user.status,
          emailVerifiedAt: user.emailVerifiedAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            status: user.status,
            passwordHash: user.passwordHash.value,
            emailVerifiedAt: user.emailVerifiedAt,
            updatedAt: user.updatedAt,
          },
        });
      if (events.length > 0) {
        await tx.insert(outbox).values(
          events.map((event) => ({
            aggregateId: event.aggregateId,
            type: event.type,
            payload: event.payload,
            occurredAt: event.occurredAt,
          })),
        );
      }
    });
  }

  async findByEmail(email: Email): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email.value)).limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findById(id: UserId): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id.value)).limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: typeof users.$inferSelect): User {
    return User.reconstitute({
      id: UserId.fromString(row.id),
      email: Email.reconstitute(row.email),
      passwordHash: PasswordHash.fromEncoded(row.passwordHash),
      status: row.status as UserStatus,
      emailVerifiedAt: row.emailVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
