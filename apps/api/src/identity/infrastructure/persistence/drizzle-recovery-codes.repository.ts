import { and, count, eq, isNull } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { UserId } from '../../../shared/kernel/user-id';
import { RecoveryCode } from '../../domain/recovery-code';
import { type RecoveryCodesRepository } from '../../domain/ports/recovery-codes-repository';
import { recoveryCodes } from './schema';

export class DrizzleRecoveryCodesRepository implements RecoveryCodesRepository {
  constructor(private readonly db: Database) {}

  async replaceForUser(userId: UserId, codes: RecoveryCode[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(recoveryCodes)
        .where(and(eq(recoveryCodes.userId, userId.value), isNull(recoveryCodes.consumedAt)));
      if (codes.length > 0) {
        await tx.insert(recoveryCodes).values(
          codes.map((code) => ({
            id: code.id,
            userId: code.userId.value,
            codeHash: code.codeHash,
            consumedAt: code.consumedAt,
            createdAt: code.createdAt,
          })),
        );
      }
    });
  }

  async findByHash(userId: UserId, codeHash: string): Promise<RecoveryCode | null> {
    const rows = await this.db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId.value), eq(recoveryCodes.codeHash, codeHash)))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async consume(code: RecoveryCode): Promise<void> {
    await this.db
      .update(recoveryCodes)
      .set({ consumedAt: code.consumedAt })
      .where(eq(recoveryCodes.id, code.id));
  }

  async countActive(userId: UserId): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId.value), isNull(recoveryCodes.consumedAt)));
    return rows[0]?.value ?? 0;
  }

  private toDomain(row: typeof recoveryCodes.$inferSelect): RecoveryCode {
    return RecoveryCode.reconstitute({
      id: row.id,
      userId: UserId.fromString(row.userId),
      codeHash: row.codeHash,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    });
  }
}
